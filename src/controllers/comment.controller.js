import mongoose from "mongoose"
import {Comment} from "../models/comment.model.js"
import {Video} from "../models/video.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const getVideoComments = asyncHandler(async (req, res) => {
    //TODO: get all comments for a video
    const {videoId} = req.params
    const {page = 1, limit = 10} = req.query
    // convert query strings to numbers once, then use these everywhere below
    const pageNum = Number(page)
    const limitNum = Number(limit)

    // NaN and fractions like 2.5 fail Number.isInteger
    if (!Number.isInteger(pageNum) || pageNum < 1) {
        throw new ApiError(400, "page must be a positive integer")
    }
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
        throw new ApiError(400, "limit must be an integer between 1 and 100")
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    const pipeline = [
        {
            $match: {
                video: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $sort: { createdAt: -1 }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner"
        },
        {
            $project: {
                content: 1,
                createdAt: 1,
                "owner._id": 1,
                "owner.username": 1,
                "owner.avatar": 1
            }
        }
    ]
    
    const aggregate = Comment.aggregate(pipeline)
    
    const options = {
        page: pageNum,
        limit: limitNum
    }
    
    const result = await Comment.aggregatePaginate(aggregate, options)
    
    /*
    Comment.aggregatePaginate appends its own paging stages (skip and limit) after your five stages. 
    You don't write those yourself. This is why the order of your stages matters: the paging happens 
    last, on the already filtered and sorted results.
    */
    
    return res
        .status(200)
        .json(new ApiResponse(200, result, "Comments fetched successfully"))
    

})

const addComment = asyncHandler(async (req, res) => {
    // TODO: add a comment to a video
    // get videoID from req.params and run validations (video must exist, videoID validations done previously etc)
    // get comment from req.body and run validations
    // create a mongoose document
    // send a response 201 upon successful creation
    // handle errors in  every step using ApiError

    const {videoId} = req.params
    const {content} = req.body

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    if (typeof content !== "string" || !content.trim()) {
        throw new ApiError(400, "Comment content is required")
    }

    const comment = await Comment.create({
        content: content.trim(),
        video: videoId,
        owner: req.user._id
    })

    return res
        .status(201)
        .json(new ApiResponse(201, comment, "Comment added successfully"))
})

const updateComment = asyncHandler(async (req, res) => {
    // TODO: update a comment
    // ownership checks => check using auth middleware which user is logged in and check if the comment to updated belongs to that user
    // get commentID from req.params and run validations (comment must exist + other validations done previously etc)
    // get updated_content from req.body
    // get the document / comment we need to update 
    // make updates to that comment and commit changes to db
    // send a appropriate response
    // handle errors in  every step using ApiError

    const {commentId} = req.params
    const {content} = req.body

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID")
    }

    if (typeof content !== "string" || !content.trim()) {
        throw new ApiError(400, "Comment content is required")
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
        throw new ApiError(404, "Comment not found")
    }

    if (!comment.owner.equals(req.user._id)) {
        throw new ApiError(403, "You are not allowed to update this comment")
    }

    comment.content = content.trim()
    await comment.save()

    return res
        .status(200)
        .json(new ApiResponse(200, comment, "Comment updated successfully"))
})

const deleteComment = asyncHandler(async (req, res) => {
    // TODO: delete a comment
    // ownership checks => check using auth middleware which user is logged in and check if the comment to updated belongs to that user
    // get commentID from req.params and run validations (comment must exist + other validations done previously etc)
    // get the document / comment we need to delete
    // send a appropriate response
    // handle errors in  every step using ApiError

    const {commentId} = req.params

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID")
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
        throw new ApiError(404, "Comment not found")
    }

    if (!comment.owner.equals(req.user._id)) {
        throw new ApiError(403, "You are not allowed to delete this comment")
    }

    await Comment.findByIdAndDelete(commentId)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Comment deleted successfully"))
})

export {
    getVideoComments, 
    addComment, 
    updateComment,
     deleteComment
    }