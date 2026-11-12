import fs from "fs"
import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"


// multer saves uploads in public/temp before the handler runs, so any early exit must delete them
// (uploadOnCloudinary already deletes the files it uploads, hence the existsSync check)
const removeTempFiles = (...paths) => {
    paths.filter(Boolean).forEach((path) => {
        if (fs.existsSync(path)) fs.unlinkSync(path)
    })
}

// returns the video if the logged-in user owns it, otherwise throws 400 / 404 / 403
async function getOwnedVideo(videoId, userId) {
    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }
    const video = await Video.findById(videoId)
    if (video === null) {
        throw new ApiError(404, "Video not found")
    }
    if (!video.owner.equals(userId)) {
        throw new ApiError(403, "You can't modify this video")
    }
    return video
}

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query

    const pageNum = Math.max(parseInt(page) || 1, 1)
    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100)

    // only published videos, unless a user is looking at their own channel
    const match = {isPublished: true}

    if (userId !== undefined) {
        if (!mongoose.isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid user ID")
        }
        match.owner = new mongoose.Types.ObjectId(userId)
        if (req.user._id.equals(userId)) {
            delete match.isPublished
        }
    }

    if (typeof query === "string" && query.trim()) {
        // escape regex characters so the search text is matched literally
        const text = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        match.$or = [
            {title: {$regex: text, $options: "i"}},
            {description: {$regex: text, $options: "i"}}
        ]
    }

    // only sort by whitelisted fields
    const allowedSortFields = ["createdAt", "views", "duration", "title"]
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt"
    const sortDirection = sortType === "asc" ? 1 : -1

    const aggregate = Video.aggregate([
        {$match: match},
        {$sort: {[sortField]: sortDirection}},
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {$unwind: "$owner"},
        {
            $project: {
                title: 1,
                description: 1,
                thumbnail: 1,
                videoFile: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                createdAt: 1,
                "owner._id": 1,
                "owner.username": 1,
                "owner.avatar": 1
            }
        }
    ])

    const result = await Video.aggregatePaginate(aggregate, {page: pageNum, limit: limitNum})

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Videos fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    const videoLocalPath = req.files?.videoFile?.[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path

    try {
        if (typeof title !== "string" || !title.trim()) {
            throw new ApiError(400, "Title is required")
        }
        if (typeof description !== "string" || !description.trim()) {
            throw new ApiError(400, "Description is required")
        }
        if (!videoLocalPath || !thumbnailLocalPath) {
            throw new ApiError(400, "Both a video file and a thumbnail are required")
        }

        const videoUpload = await uploadOnCloudinary(videoLocalPath)
        if (!videoUpload?.url) {
            throw new ApiError(500, "Failed to upload the video")
        }
        const thumbnailUpload = await uploadOnCloudinary(thumbnailLocalPath)
        if (!thumbnailUpload?.url) {
            throw new ApiError(500, "Failed to upload the thumbnail")
        }

        const video = await Video.create({
            videoFile: videoUpload.url,
            thumbnail: thumbnailUpload.url,
            title: title.trim(),
            description: description.trim(),
            duration: videoUpload.duration ?? 0,
            owner: req.user._id
        })

        return res
            .status(201)
            .json(new ApiResponse(201, video, "Video published successfully"))
    } catch (error) {
        removeTempFiles(videoLocalPath, thumbnailLocalPath)
        throw error
    }
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    const video = await Video.findById(videoId)
    // an unpublished video is visible only to its owner (reported as 404 to everyone else)
    if (video === null || (!video.isPublished && !video.owner.equals(req.user._id))) {
        throw new ApiError(404, "Video not found")
    }

    // count the view and return the updated video with the uploader's details
    const updated_video = await Video.findByIdAndUpdate(
        videoId,
        {$inc: {views: 1}},
        {new: true}
    ).populate("owner", "username fullName avatar")

    return res
        .status(200)
        .json(new ApiResponse(200, updated_video, "Video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body
    const thumbnailLocalPath = req.file?.path

    try {
        if (title === undefined && description === undefined && !thumbnailLocalPath) {
            throw new ApiError(400, "Provide a title, description or thumbnail to update")
        }

        // only the fields that were sent are changed
        const fields = {}
        if (title !== undefined) {
            if (typeof title !== "string" || !title.trim()) {
                throw new ApiError(400, "Title must be a non-empty string")
            }
            fields.title = title.trim()
        }
        if (description !== undefined) {
            if (typeof description !== "string" || !description.trim()) {
                throw new ApiError(400, "Description must be a non-empty string")
            }
            fields.description = description.trim()
        }

        await getOwnedVideo(videoId, req.user._id)

        if (thumbnailLocalPath) {
            const thumbnailUpload = await uploadOnCloudinary(thumbnailLocalPath)
            if (!thumbnailUpload?.url) {
                throw new ApiError(500, "Failed to upload the thumbnail")
            }
            fields.thumbnail = thumbnailUpload.url
        }

        const updated_video = await Video.findByIdAndUpdate(
            videoId,
            {$set: fields},
            {new: true}
        )

        return res
            .status(200)
            .json(new ApiResponse(200, updated_video, "Video updated successfully"))
    } catch (error) {
        removeTempFiles(thumbnailLocalPath)
        throw error
    }
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    await getOwnedVideo(videoId, req.user._id)
    await Video.findByIdAndDelete(videoId)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    const video = await getOwnedVideo(videoId, req.user._id)
    video.isPublished = !video.isPublished
    await video.save()

    return res
        .status(200)
        .json(new ApiResponse(200, {isPublished: video.isPublished}, video.isPublished ? "Video published" : "Video unpublished"))
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}