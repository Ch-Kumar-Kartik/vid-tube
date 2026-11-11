import mongoose from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const getChannelStats = asyncHandler(async (req, res) => {
    // the dashboard always shows the logged-in user's own channel
    const user_id = req.user._id

    // total videos: count every video this user owns (published and unpublished)
    const total_videos = await Video.countDocuments({owner: user_id})

    // total views: sum the views field across this user's videos
    const views_pipeline = [
        {
            $match: {
                owner: user_id
            }
        },
        {
            $group: {
                _id: null,
                totalViews: {$sum: "$views"}
            }
        },
        {
            $project: {
                _id: 0,
                totalViews: 1
            }
        }
    ]

    // total likes: count likes whose video belongs to this user (videos only, not comments or tweets)
    const likes_pipeline = [
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video"
            }
        },
        {
            $unwind: "$video"
        },
        {
            $match: {
                "video.owner": user_id
            }
        },
        {
            $group: {
                _id: null,
                totalLikes: {$sum: 1}
            }
        },
        {
            $project: {
                _id: 0,
                totalLikes: 1
            }
        }
    ]

    // total subscribers: count subscriptions where this user is the channel
    const total_subscribers = await Subscription.countDocuments({channel: user_id})

    const [viewsResult, likesResult] = await Promise.all([
        Video.aggregate(views_pipeline),
        Like.aggregate(likes_pipeline)
    ])

    // a user with no videos or likes gets an empty array, so fall back to 0
    const stats = {
        totalVideos: total_videos,
        totalViews: viewsResult[0]?.totalViews ?? 0,
        totalLikes: likesResult[0]?.totalLikes ?? 0,
        totalSubscribers: total_subscribers
    }

    return res
        .status(200)
        .json(new ApiResponse(200, stats, "Channel stats fetched successfully"))
})

const getChannelVideos = asyncHandler(async (req, res) => {
    const user_id = req.user._id

    // list every video this user owns, including unpublished ones, newest first
    const videos = await Video.find({owner: user_id}).sort({createdAt: -1})

    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Channel videos fetched successfully"))
})

export {
    getChannelStats,
    getChannelVideos
    }
