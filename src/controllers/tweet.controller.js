import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

// returns the tweet if the logged-in user owns it, otherwise throws 400 / 404 / 403
async function getOwnedTweet(tweetId, userId) {
    if (!mongoose.isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID")
    }
    const tweet = await Tweet.findById(tweetId)
    if (tweet === null) {
        throw new ApiError(404, "Tweet not found")
    }
    if (!tweet.owner.equals(userId)) {
        throw new ApiError(403, "You can't modify this tweet")
    }
    return tweet
}

const createTweet = asyncHandler(async (req, res) => {
    const {content} = req.body

    if (typeof content !== "string" || !content.trim()) {
        throw new ApiError(400, "Tweet content is required")
    }

    // the owner always comes from the logged-in user, never from req.body
    const tweet = await Tweet.create({
        content: content.trim(),
        owner: req.user._id
    })

    return res
        .status(201)
        .json(new ApiResponse(201, tweet, "Tweet created successfully"))
})

const getUserTweets = asyncHandler(async (req, res) => {
    const {userId} = req.params

    if (!mongoose.isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID")
    }

    // an unknown user simply has no tweets, so an empty list is returned
    const tweets = await Tweet.find({owner: userId})
        .sort({createdAt: -1})
        .populate("owner", "username fullName avatar")

    return res
        .status(200)
        .json(new ApiResponse(200, tweets, "Tweets fetched successfully"))
})

const updateTweet = asyncHandler(async (req, res) => {
    const {tweetId} = req.params
    const {content} = req.body

    if (typeof content !== "string" || !content.trim()) {
        throw new ApiError(400, "Tweet content is required")
    }

    const tweet = await getOwnedTweet(tweetId, req.user._id)
    tweet.content = content.trim()
    await tweet.save()

    return res
        .status(200)
        .json(new ApiResponse(200, tweet, "Tweet updated successfully"))
})

const deleteTweet = asyncHandler(async (req, res) => {
    const {tweetId} = req.params

    await getOwnedTweet(tweetId, req.user._id)
    await Tweet.findByIdAndDelete(tweetId)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Tweet deleted successfully"))
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}