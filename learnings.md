# Learnings

Notes from building this backend: how the pieces fit, and the mistakes that showed up along the way.

## Request flow: router, Multer, controller

A register request passes through three pieces, in order.

1. **Router** is the address. `app.js` mounts this router at `/api/v1/users`. `router.route("/register").post(...)` adds `/register` for POST only. The full URL is `POST /api/v1/users/register`.
2. **Multer** runs first. The body is form-data, which mixes text and files. Multer separates them:
   - text fields (`fullName`, `email`, `username`, `password`) go on `req.body`
   - files named `avatar` and `coverImage` are saved in `public/temp`, and their paths go on `req.files`
   Multer does not create a user. If it fails, `registerUser` never runs.
3. **Controller** (`registerUser`) reads what Multer prepared, uploads the images to Cloudinary, creates the user in MongoDB, and sends the JSON response.

Mounting the router does not send every `/api/v1/users` request to `/register`. `app.use("/api/v1/users", userRouter)` only means "if the path starts with this prefix, hand the request to this router." The router then matches the leftover path and the method against its own routes.

| Request | Result |
|---|---|
| `POST /api/v1/users/register` | `registerUser` |
| `GET /api/v1/users/register` | 404, because only POST is defined |
| `POST /api/v1/users` | 404 |
| `POST /api/v1/users/login` | 404 until a `/login` route exists |

For `POST /api/v1/users/register` the leftover path is `/register`. Express answers an unmatched path with `Cannot POST /api/v1/register/user` (or whatever URL was actually sent). That HTML page is a 404, not a controller error.

`router.route("/register").post(registerUser)` is the same idea as `app.post("/register", registerUser)`. The prefix in `app.js` is what makes the public URL `/api/v1/users/register`. `.route()` is useful when several methods share one path (`.get(...).post(...)`). `router.post("/register", registerUser)` is equivalent for a single method.

A router is not required for one route. `app.post("/api/v1/users/register", registerUser)` would work. The router exists so each feature keeps its own file (`user.routes.js`, later video routes) and `app.js` only mounts prefixes. Paths inside the file stay short (`/register`), and a group can share middleware such as `verifyJWT`.

`upload.fields` must receive **one array**:

```js
upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 }
])
```

Passing two separate objects makes Multer call `.forEach` on a plain object, which throws `fields.forEach is not a function`.

## Default export and `app.listen`

`export default app` and `export { app }` are different.

- `export default app` is the file's one main export. The importer chooses the local name: `import app from "./app.js"`.
- `export { app }` (or `export const app = ...`) is a named export. The import must use that exact name: `import { app } from "./app.js"`.

`export default { app }` does neither of those usefully. It exports an object whose property is the Express app. `import app from "./app.js"` then binds `app` to `{ app: <express> }`. That object has no `.listen`, so startup throws `TypeError: app.listen is not a function`.

That throw happens inside `connectDB().then(...)`. The `.catch` still runs, so the log says `MONGO db connection failed !!!` even after `MongoDB connected !!`. The database step succeeded. The listen step failed.

A file can have many named exports and only one default. `import app, { PORT } from "./app.js"` takes both.

The route import in `app.js` sits under the middleware on purpose in this project, next to `app.use("/api/v1/users", userRouter)`. ESM `import` is hoisted, so it runs before the rest of the file either way. Putting every import at the top is the usual style. It does not change when the module loads.

## `uploadOnCloudinary`

Text fields arrive on `req.body`. Files do not. Multer must run on the route first, or `req.files` is `undefined`.

```js
const avatarLocalPath = req.files?.avatar?.[0]?.path
const coverImageLocalPath = req.files?.coverImage?.[0]?.path

if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required")
}

const avatar = await uploadOnCloudinary(avatarLocalPath)
const coverImage = await uploadOnCloudinary(coverImageLocalPath)
```

`uploadOnCloudinary` takes one string: the temp path on disk (`public/temp/...`). It does not take the file buffer or the Postman file object. It returns the Cloudinary response, or `null` when the path is missing or the upload fails. It also deletes the local temp file.

Store the URL, not the whole response:

```js
avatar: avatar.url
coverImage: coverImage?.url || ""
```

`avatar` is required, so a `null` result should throw. `coverImage` is optional, so `?.` is enough. Postman must use **form-data**, with the file field names `avatar` and `coverImage`. A JSON body cannot send files. Those names must match `upload.fields`.

## `req.body`, `req.params`, `req.query`

These are three different parts of the same request.

- **`req.params`** is the variable part of the path. Route `/:videoId` plus `GET /api/v1/comments/64ab12` gives `req.params = { videoId: "64ab12" }`.
- **`req.query`** is the text after `?`. `GET /api/v1/comments/64ab12?page=2&limit=10` gives `req.query = { page: "2", limit: "10" }`. Query values arrive as strings.
- **`req.body`** is the request body, parsed by `express.json()` or Multer. A POST with `{ "content": "nice video" }` gives `req.body = { content: "nice video" }`. A GET normally has an empty body.

One request can have all three: the id in the path, `page` in the query string, and the comment text in the body.

## `asyncHandler`

Express calls route handlers as `(req, res, next) => {}`. It does not await them and it ignores their return value.

An `async` handler throws by returning a rejected Promise. Express never sees that Promise, so the request gets no error response unless something calls `next(err)`.

`asyncHandler` runs once, when the route is registered. It returns a normal `(req, res, next)` function. That function runs the real handler, and `.catch` calls `next(err)` if the Promise rejects. The error middleware in `app.js` then sends the JSON response.

`next(err)` is a normal function. This file reaches it from `.catch`. The same wrapper can be written with `try/await` and `next(err)` in the `catch` block.

Returning a value from the handler does not send it to the client. Only `res.json(...)` or `res.send(...)` does.

## `ApiError`

`ApiError` extends JavaScript's `Error`. `super(message)` calls the parent constructor, which stores `err.message` and starts the stack trace. A child constructor must call `super` before it uses `this`.

The extra fields (`statusCode`, `errors`, `success`, `data`) are what `app.js` reads to build the JSON error response. `throw new ApiError(400, "Avatar file is required")` is still a real error, so `asyncHandler` can catch it.

## `userSchema.methods`

`userSchema.methods` adds functions that belong to one user document. They are not exported on their own. Import the `User` model, load a document, then call the method on it:

```js
const user = await User.findOne({ email })
const ok = await user.isPasswordCorrect("1234567890")
```

Inside the method, `this` is that document. `this.password` is the hash saved by the `pre("save")` hook. `bcrypt.compare` checks the plain password against that hash.

`generateAccessToken` and `generateRefreshToken` are the same kind of method. They are normal functions, so `await` is unnecessary, though it still works.

In Mongoose 9, an `async` `pre("save")` hook does not receive `next`. Calling `next()` throws `next is not a function`. The hook should just `return`, and `await` the hash.

## Login checks

`!email` is true for falsy values: missing (`undefined`), `null`, and `""`. It is false for `" "`, because a string of spaces is truthy. `email.length` throws if `email` is `undefined`. `email?.trim()` covers a missing field, an empty string, and spaces.

Login needs two rules:

- at least one of `email` or `username` (`&&`, so the error runs only when both are empty)
- `password` always

`.some(field => field?.trim() === "")` means "fail if any field is empty." That fits register, where every field is required. It does not fit login, because a request with only an email would fail for a missing username.

The same "at least one" rule can be written as:

```js
if (![email, username].some((field) => field?.trim())) {
    throw new ApiError(400, "username or email is required")
}
```

When building the Mongo query, only include the field that was sent. `{ email: undefined }` inside `$or` can match the wrong documents. Lowercase the username so it matches what registration saved.

## Cookies and JWT

A JWT and a cookie are different things, and this app uses both.

- A **JWT** is a signed string. `jwt.sign` builds it from the user id and other fields. The server checks the signature with the secret instead of storing a session.
- A **cookie** is how the browser stores and sends a value. `res.cookie("accessToken", token, options)` asks the browser to save it. Later requests to the same site include it automatically.

The browser stores the cookie, not the server. Login sends:

```http
Set-Cookie: accessToken=<jwt>; HttpOnly; Secure
```

The next request sends:

```http
Cookie: accessToken=<jwt>; refreshToken=<jwt>
```

`cookieParser()` in `app.js` turns that header into `req.cookies`. The tokens are not inside `req.body`.

```js
req.cookies = {
    accessToken: "eyJ...",
    refreshToken: "eyJ..."
}
```

`options` on `res.cookie` and `clearCookie` are flags, not response data:

- `httpOnly: true` means page JavaScript cannot read the cookie. The browser still sends it.
- `secure: true` means the browser only sends it over HTTPS.

`clearCookie` must use the same flags. Otherwise the browser treats it as a different cookie and does not delete it.

`jwt.verify(token, secret)` checks the signature and the expiry, then returns the payload. It throws if the token was edited, signed with another secret, or is expired. `jwt.decode(token)` only reads the payload and does not check anything, so it cannot prove the user is logged in.

## `verifyJWT`

```js
const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
```

- `?.` avoids a crash when `req.cookies` or the header is missing. The result is `undefined` instead of `Cannot read properties of undefined`.
- Two places are checked because clients send the token differently. A browser sends the cookie. Postman or a mobile app sends `Authorization: Bearer <token>`. `||` uses the cookie first, then the header.
- `replace("Bearer ", "")` removes the label. `jwt.verify` needs the raw token. The cookie is already only the token.

After the token is valid and the user is loaded:

```js
req.user = user
next()
```

`req.user` is a new field on the request object. It is not `req.body`. `user` is the database document, without password and refresh token. `next()` with no argument means this middleware is done, so Express runs the next function in the route.

```js
router.route("/logout").post(verifyJWT, logoutUser)
```

Express runs `verifyJWT`, then `logoutUser`. Logout reads `req.user._id`. If the token is missing or invalid, `verifyJWT` throws and `logoutUser` never runs. Register and login do not use this middleware, because those requests have no token yet.

## `Promise.all` and `async`

The function is already `async`. `await` waits for one promise. Two separate `await`s run one after the other, so the total wait is the sum of both.

`Promise.all` starts both aggregates immediately because neither query needs the other's result. `await` still waits, but only for the combined promise, so the wait is about as long as the slower query. If either one fails, `Promise.all` rejects and `asyncHandler` sends the error.

## Connection and setup mistakes

- `ECONNREFUSED 127.0.0.1:800` means nothing is listening on that port. This app uses port `8000`.
- A `404` with `server: uvicorn` and `{ "detail": "Not Found" }` means another app (the Python API) is the one bound to port `8000`.
- `mongoose.connect(`${MONGODB_URI}/${DB_NAME}`)` becomes `...mongodb.net//videotube` when the URI already ends with `/`. Mongo then rejects the namespace `/videotube.users`. Strip trailing slashes before joining the database name.
- Cloudinary config that runs at import time can see empty env vars, because ESM imports run before `dotenv.config()`. Configure Cloudinary inside the upload function. A failed upload that returns `null` is not the same as a missing file.
- `secure: true` cookies are not stored by the browser on plain `http://localhost`.

## Object literals

An object literal is an object written directly in the code with curly braces and `key: value` pairs separated by commas:

```js
{ video: targetId, likedBy: userId }
```

"Literal" means the value is spelled out in the source, like `"hello"` (string literal) or `42` (number literal). Passing one straight into a function, as in `Like.findOneAndDelete({ ... })`, creates the object inline. `{ model: Video, field: "video" }` in `targetConfig` is also an object literal.

### Other ways to build an object

- **Empty literal, then add properties:** `const filter = {}; filter.video = targetId`. Bracket notation works too: `filter[t.field] = targetId`.
- **`new Object()`:** same result, rarely used because `{}` is shorter.
- **A class or constructor with `new`:** `new ApiError(400, "msg")` and `new ApiResponse(200, data, "OK")` build objects from a template.
- **`Object.create(proto)`:** builds an object with a chosen prototype. `Object.create(null)` gives an object with no inherited properties.
- **Copy or merge:** `Object.assign({}, base, extra)` or the spread form `{ ...base, likedBy: userId }`.
- **`JSON.parse`:** turns a JSON string into an object. `express.json()` builds `req.body` this way.

For a small object whose keys are known up front, the literal is the normal choice.

## Destructuring

Braces on the left side of `=` pull properties out of an existing object. They are not an object literal, even though they look alike.

```js
const { videoId } = req.params      // same as: const videoId = req.params.videoId
const { page, limit } = req.query   // several at once
const { videoId: id } = req.params  // rename
const { page = 1 } = req.query      // default when missing
```

The name inside the braces must match the property name, or the variable is `undefined`. Without braces, `const videoId = req.params` stores the whole params object.

A mistake that showed up: `const { userId } = req.user._id`. `req.user._id` is an ObjectId, and an ObjectId has no `userId` property, so `userId` was `undefined`. When the value itself is what you want, drop the braces: `const userId = req.user._id`.

## Computed property names

In an object literal, a normal key is a fixed name. Square brackets tell JavaScript to evaluate the expression and use the result as the key:

```js
{ video: targetId }         // key is the text "video"
{ [t.field]: targetId }     // key is the value of t.field, e.g. "video" or "comment"
```

Without the brackets, `{ t.field: targetId }` is a syntax error, and `{ field: targetId }` uses the literal key `"field"`. This is how one line of code builds the `Like` filter for videos, comments, and tweets.

## Plain object vs `Map`

`targetConfig` is a plain object used as a lookup table, not a `Map`.

- **Plain object:** string (or symbol) keys, read with `obj[key]`. A missing key gives `undefined`.
- **`new Map()`:** the dedicated key-value type. Keys can be any type, and it uses `.get()`, `.set()`, and `.has()`. `Map<K, V>` with angle brackets is TypeScript notation. Plain JavaScript has no type parameters.

A plain object also inherits properties such as `toString` and `constructor`, so `targetConfig["toString"]` returns a function instead of `undefined`. When the key comes from outside, check with `Object.hasOwn(targetConfig, target)`. Note that `hasOwn` is a static method on `Object`. `targetConfig.hasOwn(...)` is not a function.

For a small, fixed table, a plain object is simpler and more common than a `Map`.

### The lookup-table pattern

When several cases run the same steps and differ only in a couple of values, store those values in a table keyed by case instead of writing one `if` per case:

```js
const targetConfig = {
    video: { model: Video, field: "video" },
    comment: { model: Comment, field: "comment" },
    tweet: { model: Tweet, field: "tweet" }
}
```

- `model` answers "does this thing exist?" (a query on the entity's own collection).
- `field` answers "has this user liked it?" (the field name on the `Like` document).

An unknown type is simply a missing key, so one check covers it. Adding a new type is one new line.

## Mongoose query filters

The object passed to `find`, `findOne`, `findOneAndDelete`, and similar methods is a filter. Each key is a field name and each value is what it must equal. Several keys mean AND.

```js
Like.findOneAndDelete({ [t.field]: targetId, likedBy: userId })
```

- `findOneAndDelete` finds one match, deletes it, and returns it, or `null` if nothing matched. One call both checks and removes, so a toggle can use the result directly: a returned document means unliked, `null` means create the like.
- `findById` returns `null` for a missing document. It does not throw, so a `try/catch` around it will never produce the 404. Check the result instead.
- `Like.create(...)` takes an object too, but there it is the data for the new document, not a filter.

## Aggregation pipeline

A pipeline is an array of stages. Each stage takes the documents from the previous stage, changes them, and passes them on. The output of the last stage is the result. Stage names start with `$`.

```js
db.orders.aggregate([
    { $match: { status: "paid" } },     // keep some documents
    { $sort: { qty: -1 } },             // order them
    { $project: { item: 1, _id: 0 } }   // keep only some fields
])
```

Common stages:

- `$match` filters. Put it early so later stages process less.
- `$sort`, `$skip`, `$limit` behave like the `.sort()`, `.skip()`, `.limit()` methods.
- `$project` keeps (1) or drops (0) fields and can reshape documents.
- `$group` combines documents by a key. `_id: null` puts everything in one group, and `$sum` adds a field or counts with `$sum: 1`.
- `$lookup` joins another collection. `from` is the collection name, not the model name (Mongoose lowercases and pluralizes it, so `User` becomes `users`). The result is always an array.
- `$unwind` turns an array field into one document per item. After a one-item `$lookup` it flattens the array into an object, and it drops documents whose array is empty, such as a like whose video was deleted.
- `$replaceRoot` promotes a nested object to the top level, so a pipeline over likes can output the videos themselves.

Things that showed up:

- Aggregation does not cast strings to ObjectIds the way `find` does. A string `videoId` needs `new mongoose.Types.ObjectId(videoId)` in `$match`. `req.user._id` is already an ObjectId, so it can be used directly.
- `$group` over zero documents returns an empty array, not a document with zeros. Read the result with a fallback, such as `result[0]?.totalViews ?? 0`.
- A `$sort` on a field of the original document (like the like's `createdAt`) must come before `$replaceRoot`, or that field is gone.
- `aggregatePaginate` appends its own paging stages after the pipeline. Stage order matters because paging runs last.

## Mistakes that showed up in this controller work

- **`throw ApiError(...)` without `new`.** `ApiError` is a class, so this throws "Class constructor cannot be invoked without 'new'". Use `throw new ApiError(...)`.
- **A missing `await`.** `findOneAndDelete(...)` without `await` returns a query object that is always truthy, so a check on it is wrong. `Like.create(...)` without `await` lets the function return before the save finishes, and a failure becomes an unhandled rejection that `asyncHandler` cannot catch.
- **Returning from a handler instead of responding.** `return toggleLike(...)` sends nothing, and the request hangs. Only `res.status(...).json(...)` responds. Await the helper and send the result.
- **Module-level code that uses `req`.** `req` exists only inside a handler. A pipeline or helper written at the top of the file with `req.user._id` throws `ReferenceError: req is not defined` the moment the file is imported, so the whole server fails to start. Build request-dependent values inside the handler, or write a function that takes them as parameters.
- **Block scope.** `const t = ...` declared inside an `if` block is not visible after the block. Throw for the invalid case first (a guard clause) so the variables live at function level.
- **Wrong status codes.** A malformed ID is 400, not 404 or 421. A missing resource is 404. A signed-in user acting on something they do not own is 403. A database that is down is 503.
- **Checking the model instead of the document.** After `const found = await Playlist.findById(id)`, the owner check must use `found.owner`, not `Playlist.owner`.

## Promises and `await`

**What a promise is**

A database call takes time, since the request goes over the network and MongoDB does the work. JavaScript doesn't stop and wait. Instead, `Playlist.create(...)` returns a **promise** immediately: an object that stands for a result that doesn't exist yet. A promise is in one of three states:

- **pending:** the work isn't finished
- **fulfilled:** it finished, and the promise holds the result (here, the saved playlist)
- **rejected:** it failed, and the promise holds the error

**What `await` does**

`await` goes in front of a promise and does two things:

1. It pauses *that function* until the promise settles.
2. It gives you what's inside: the fulfilled value, or it throws the error if the promise was rejected.

```js
const new_playlist = await playlist.create({ ... })
// new_playlist is the saved document here, not a promise
```

The pause only affects the current handler. While it waits, Node keeps serving other requests. Nothing else blocks.

**Without `await`**

```js
const new_playlist = playlist.create({ ... })
// new_playlist is the Promise object itself, still pending
```

The next line runs immediately. Putting `new_playlist` in `ApiResponse` sends a pending promise, which serializes to an empty object, so the client gets no playlist. And if the save fails, nobody is waiting on the promise, so the rejection is unhandled. That can crash the Node process, and `asyncHandler` never sees it.

**Why `asyncHandler` works with `await`**

When an awaited promise rejects, `await` throws the error inside your handler. The handler's own promise then rejects, and `asyncHandler`'s `.catch` hands the error to `next(err)`, which sends the JSON error response. This is why you don't need `try/catch` in each handler. Your `throw new ApiError(...)` lines take the same path.

**Two rules**
- `await` only works inside an `async` function (or at the top level of an ES module). That's why your handlers are written `async (req, res) => { ... }`.
- Two awaits in a row run one after the other. `Promise.all([a, b])` starts both at once and waits for both. You used that in `getChannelStats`.

**A difference between `create` and queries**

`create` starts saving as soon as you call it. A query like `findOneAndDelete(...)` or `find(...)` doesn't run until you `await` it (or call `.then` or `.exec`). So forgetting `await` on `create` still saves the document but loses the result and the error. Forgetting it on a query can mean the query never runs at all.
