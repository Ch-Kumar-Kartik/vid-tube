/*
    Express calls route handlers as (req, res, next) => {}.
    It does not await them and it ignores their return value.

    An async handler throws by returning a rejected Promise.
    Express never sees that Promise, so the request gets no error response
    unless something calls next(err).

    asyncHandler runs once, when the route is registered. It returns a
    normal (req, res, next) function that Express can call. That function
    runs the real handler, and .catch calls next(err) if the Promise rejects.
    The error middleware in app.js then sends the JSON response.

    Same idea with async/await:

        return async (req, res, next) => {
            try {
                await requestHandler(req, res, next)
            } catch (err) {
                next(err)
            }
        }
*/
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next))
        .catch((err) => next(err))
    }
}

export {asyncHandler} 