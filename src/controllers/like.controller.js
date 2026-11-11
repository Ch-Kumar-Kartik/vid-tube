import mongoose from "mongoose"
import {Like} from "../models/like.model.js"
import {Video} from "../models/video.model.js"
import {Comment} from "../models/comment.model.js"
import {Tweet} from "../models/tweet.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const targetConfig = {
    video: {model: Video, field: "video"},
    comment: {model: Comment, field: "comment"},
    tweet: {model: Tweet, field: "tweet"}
}

const toggleLike = async (target, targetId, userId) => {
    const t = targetConfig[target]
    // get the config for this target type, throw 400 if it doesn't exist
    if (Object.hasOwn(targetConfig, target)) {
        // validate targetId, throw 400 if invalid
        if (!mongoose.isValidObjectId(targetId)) {
            throw new ApiError(400, `Invalid ${target} ID`)
        }
        // check the target exists in its model, throw 404 if not
        const tgt = await t.model.findById(targetId);
        if (tgt === null) {
            throw new ApiError(404, `${target} not found`)
        }
    } else {
        throw new ApiError(400, "Invalid target type")
    }
    // 4. try to remove the existing like for this target and user
    const existing_like = await Like.findOneAndDelete({[t.field]: targetId, likedBy: userId})
    //    if one was removed, return the new state
    if (existing_like === null) {
    // 5. otherwise create a like for this target and user, return the new state
        await Like.create({[t.field]: targetId, likedBy: userId})
        return true
    } else {
        return false
    }

}


const toggleVideoLike = asyncHandler(async (req, res) => {
    const {videoId} = req.params
    const userId = req.user._id

    const isLiked = await toggleLike("video", videoId, userId)

    return res
        .status(200)
        .json(new ApiResponse(200, {isLiked}, isLiked ? "Video liked successfully" : "Video unliked successfully"))
})

const toggleCommentLike = asyncHandler(async (req, res) => {
    const {commentId} = req.params
    //TODO: toggle like on comment
    //call the helper function with the target type "comment" and commentId
    // use the returned state to send the response (liked true or false) with an appropriate status code
    const userId = req.user._id
    const isLiked = await toggleLike("comment", commentId, userId)

    return res
        .status(200)
        .json(new ApiResponse(200, {isLiked}, isLiked ? "Comment liked successfully" : "Comment unliked successfully"))

})

const toggleTweetLike = asyncHandler(async (req, res) => {
    const {tweetId} = req.params
    //TODO: toggle like on tweet
    //call the helper function with the target type "tweet" and tweetId
    // use the returned state to send the response (liked true or false) with an appropriate status code
    const userId = req.user._id

    const isLiked = await toggleLike("tweet", tweetId, userId)

    return res
        .status(200)
        .json(new ApiResponse(200, {isLiked}, isLiked ? "Tweet liked successfully" : "Tweet unliked successfully"))
}
)

const getLikedVideos = asyncHandler(async (req, res) => {
    const userId = req.user._id

    const liked_videos_pipeline = [
        {
            // this user's likes that point to a video (likes on comments/tweets have no video field)
            $match: {
                likedBy: userId,
                video: {$exists: true}
            }
        },
        {
            // most recently liked first
            $sort: {createdAt: -1}
        },
        {
            // attach the full video to each like
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video"
            }
        },
        {
            // array of one -> object; also drops likes whose video was deleted
            $unwind: "$video"
        },
        {
            // hide videos that have since been unpublished
            $match: {
                "video.isPublished": true
            }
        },
        {
            // attach the uploader's details to the video
            $lookup: {
                from: "users",
                localField: "video.owner",
                foreignField: "_id",
                as: "video.owner"
            }
        },
        {
            $unwind: "$video.owner"
        },
        {
            // output the videos themselves, not the like documents
            $replaceRoot: {newRoot: "$video"}
        },
        {
            $project: {
                title: 1,
                description: 1,
                thumbnail: 1,
                videoFile: 1,
                duration: 1,
                views: 1,
                createdAt: 1,
                "owner._id": 1,
                "owner.username": 1,
                "owner.avatar": 1
            }
        }
    ]

    // run the pipeline on the Like model and await the result
    // an empty array (no liked videos) is fine to return, no error needed
    const liked_videos = await Like.aggregate(liked_videos_pipeline)
    // send the response with ApiResponse: status 200, the videos array as data, and a message
    return res
        .status(200)
        .json(new ApiResponse(200, liked_videos, "Liked videos fetched successfully"))
    
    // optional: add pagination later (the Like model has no aggregatePaginate plugin yet)
})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}