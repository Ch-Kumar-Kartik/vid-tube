import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    const {channelId} = req.params
    const userId = req.user._id

    if (!mongoose.isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID")
    }

    // a user can't subscribe to their own channel
    if (userId.equals(channelId)) {
        throw new ApiError(400, "You can't subscribe to your own channel")
    }

    const channel = await User.exists({_id: channelId})
    if (channel === null) {
        throw new ApiError(404, "Channel not found")
    }

    // if a subscription exists remove it, otherwise create one
    const existing = await Subscription.findOneAndDelete({subscriber: userId, channel: channelId})
    let isSubscribed = false
    if (existing === null) {
        await Subscription.create({subscriber: userId, channel: channelId})
        isSubscribed = true
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {isSubscribed}, isSubscribed ? "Subscribed successfully" : "Unsubscribed successfully"))
})

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const {channelId} = req.params

    if (!mongoose.isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID")
    }

    const subscribers = await Subscription.aggregate([
        {
            $match: {channel: new mongoose.Types.ObjectId(channelId)}
        },
        {
            $sort: {createdAt: -1}
        },
        {
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber"
            }
        },
        {
            // also drops subscriptions whose user was deleted
            $unwind: "$subscriber"
        },
        {
            $project: {
                _id: 0,
                subscribedAt: "$createdAt",
                "subscriber._id": 1,
                "subscriber.username": 1,
                "subscriber.fullName": 1,
                "subscriber.avatar": 1
            }
        }
    ])

    return res
        .status(200)
        .json(new ApiResponse(200, subscribers, "Subscribers fetched successfully"))
})

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params

    if (!mongoose.isValidObjectId(subscriberId)) {
        throw new ApiError(400, "Invalid subscriber ID")
    }

    const channels = await Subscription.aggregate([
        {
            $match: {subscriber: new mongoose.Types.ObjectId(subscriberId)}
        },
        {
            $sort: {createdAt: -1}
        },
        {
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "channel"
            }
        },
        {
            $unwind: "$channel"
        },
        {
            $project: {
                _id: 0,
                subscribedAt: "$createdAt",
                "channel._id": 1,
                "channel.username": 1,
                "channel.fullName": 1,
                "channel.avatar": 1
            }
        }
    ])

    return res
        .status(200)
        .json(new ApiResponse(200, channels, "Subscribed channels fetched successfully"))
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}