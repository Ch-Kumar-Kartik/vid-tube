import { Router } from "express";
import { loginUser, logoutUser, registerUser } from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router()

/*
    Request flow for POST /api/v1/users/register

    app.js mounts this router at /api/v1/users.
    router.route("/register").post(...) adds /register, so the full URL is
    POST /api/v1/users/register.

    .post() receives two functions and Express runs them in order:

    1. Router
       Matches the URL and method, then starts the two functions below.

    2. Multer (upload.fields)
       The Postman body is form-data, which mixes text and files.
       Multer separates them:
       - text fields (fullName, email, username, password) go on req.body
       - files named avatar and coverImage are saved in public/temp,
         and their paths go on req.files
       Multer does not create a user. If it fails, registerUser never runs.

    3. Controller (registerUser)
       Reads req.body and req.files, checks the text, uploads the saved
       images to Cloudinary, creates the user in MongoDB, and sends the
       JSON response. If it throws, asyncHandler passes the error to the
       error handler in app.js.
*/

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser
)

router.route("/login").post(loginUser)

//secured routes
router.route("/logout").post(verifyJWT, logoutUser) // next() from verifyJWT passes control to logoutUser
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT, changeCurrentPassword)
router.route("/current-user").get(verifyJWT, getCurrentUser)
router.route("/update-account").patch(verifyJWT, updateAccountDetails)

router.route("/avatar").patch(verifyJWT, upload.single("avatar"), updateUserAvatar)
router.route("/cover-image").patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage)

router.route("/c/:username").get(verifyJWT, getUserChannelProfile)
router.route("/history").get(verifyJWT, getWatchHistory)

export default router