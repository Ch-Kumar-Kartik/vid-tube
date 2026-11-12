import mongoose, {isValidObjectId} from "mongoose"
import {Playlist as playlist} from "../models/playlist.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { User } from "../models/user.model.js"
import { Video } from "../models/video.model.js"

// helper function :
// takes the playlistId and the logged-in user's id (req.user._id)
async function helper(playlistId, userId) {
    // validate the playlist id => if invalid, throw 400 via ApiError
    if (!mongoose.isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID")
    }
    // check the playlist exists => if not found, throw 404 via ApiError
    const playlist_found = await playlist.findById(playlistId)
    if (playlist_found === null) {
        throw new ApiError(404, "Playlist does not exist")
    }
    // ownership check => compare playlist.owner with the user id (use .equals, not ===) => if different, throw 403 via ApiError
    if (!playlist_found.owner.equals(userId)){
        throw new ApiError(403, "Logged in user can't access this playlist")
    }
    // return the playlist so the handler can use it
    return playlist_found
    // used only by the handlers that change a playlist (update, delete, add video, remove video)
    // createPlaylist has no existing playlist, and getUserPlaylists / getPlaylistById are reads, so they don't use this helper
}

const createPlaylist = asyncHandler(async (req, res) => {
    const {name, description} = req.body
    const ownerID = req.user._id
    //TODO: create playlist
    // validate name and description: each must be a non-empty string (trim them), throw 400 if not
    if (typeof name !== "string" || !name.trim()) {
        throw new ApiError(400, "Playlist name is required")
    }

    if (typeof description !== "string" || !description.trim()) {
        throw new ApiError(400, "Playlist description is required")
    }
    // the owner comes from req.user._id, never from req.body
    // no need to create the videos array yourself: the schema gives a new playlist an empty videos array by default
    // create the playlist document
    const new_playlist = await playlist.create({
        name: name.trim(),
        description: description.trim(),
        owner: ownerID
    })

    // return the new playlist with a creation status code (201)
    return res
        .status(201)
        .json(new ApiResponse(201, new_playlist, "Playlist created successfully"))
})

const getUserPlaylists = asyncHandler(async (req, res) => {
    const {userId} = req.params
    //TODO: get user playlists
    // validate userId => if invalid, throw 400 via ApiError (no ownership check: any user's playlists can be viewed)
    if (!mongoose.isValidObjectId(userId)){
        throw new ApiError(400, "Not a valid ID")
    }
    // decide: check the user exists (404), or just return an empty list for an unknown user
    const found_user = await User.findById(userId)
    if (found_user === null) {
        return res
            .status(200)
            .json(new ApiResponse(200, [], "Playlists fetched"))
    }
    const user_playlists_pipeline = [
        {
            // this user's playlists (aggregation does not cast strings, so convert userId)
            $match: {owner: new mongoose.Types.ObjectId(userId)}
        },
        {
            // newest first
            $sort: {createdAt: -1}
        },
        {
            // video count, and the id of the first video (missing if the playlist is empty)
            $addFields: {
                totalVideos: {$size: "$videos"},
                firstVideoId: {$arrayElemAt: ["$videos", 0]}
            }
        },
        {
            // fetch that first video so its thumbnail can be the playlist cover
            $lookup: {
                from: "videos",
                localField: "firstVideoId",
                foreignField: "_id",
                as: "firstVideo"
            }
        },
        {
            // array of 0 or 1 -> object; keep empty playlists instead of dropping them
            $unwind: {path: "$firstVideo", preserveNullAndEmptyArrays: true}
        },
        {
            $project: {
                name: 1,
                description: 1,
                totalVideos: 1,
                thumbnail: "$firstVideo.thumbnail",
                createdAt: 1,
                updatedAt: 1
            }
        }
    ]
    // run it with playlist.aggregate(user_playlists_pipeline) and await the result
    const found_playlist = await playlist.aggregate(user_playlists_pipeline)
    // return the playlists with status 200 (an empty array is fine, no error)
    return res
        .status(200)
        .json(new ApiResponse(200, found_playlist, "Playlists fetched"))
})

const getPlaylistById = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    //TODO: get playlist by id
    // validate playlistId => if invalid, throw 400 via ApiError (no ownership check: this is a read)
    if (!mongoose.isValidObjectId(playlistId)){
        throw new ApiError(400, "Not a valid ID")
    }
    const playlist_pipeline = [
        {
            $match: {_id: new mongoose.Types.ObjectId(playlistId)}
        },
        {
            // replace the array of video ids with the published videos themselves
            $lookup: {
                from: "videos",
                let: {videoIds: "$videos"},
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {$in: ["$_id", "$$videoIds"]},
                                    {$eq: ["$isPublished", true]}
                                ]
                            }
                        }
                    },
                    {
                        // each video's uploader
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
                            createdAt: 1,
                            "owner._id": 1,
                            "owner.username": 1,
                            "owner.avatar": 1
                        }
                    }
                ],
                as: "videos"
            }
        },
        {
            // the playlist's own owner
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {$unwind: "$owner"},
        {
            $addFields: {totalVideos: {$size: "$videos"}}
        },
        {
            $project: {
                name: 1,
                description: 1,
                videos: 1,
                totalVideos: 1,
                createdAt: 1,
                updatedAt: 1,
                "owner._id": 1,
                "owner.username": 1,
                "owner.avatar": 1
            }
        }
    ]
    // run it with playlist.aggregate(playlist_pipeline): the result is an array, so take [0]
    const found_playlist = await playlist.aggregate(playlist_pipeline)
    // if [0] is undefined the playlist does not exist => throw 404 via ApiError
    if (!found_playlist[0]) {
        throw new ApiError(404, "Playlist not found")
    }
    // return the playlist with status 200
    return res
        .status(200)
        .json(new ApiResponse(200, found_playlist[0], "Playlist fetched"))

})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params

    // validate videoId => if invalid, throw 400 via ApiError (the helper only validates the playlist id)
    if (!mongoose.isValidObjectId(videoId)){
        throw new ApiError(400, "Invalid video ID")
    }
    // import the Video model, then check the video exists => if not found, throw 404 via ApiError
    const found_video = await Video.findById(videoId)
    if (found_video === null) {
        throw new ApiError(404, "Video does not exist")
    }
    // helper function called (validates playlist id, checks it exists, checks ownership)
    await helper(playlistId, req.user._id)
    // add the video so a duplicate is never added: use $addToSet instead of $push
    // update in one query (findByIdAndUpdate) with the new: true option so you get the updated playlist back
    const updated_playlist = await playlist.findByIdAndUpdate(
        playlistId,
        {$addToSet: {videos: videoId}},
        {new: true}
    )
    // return the updated playlist with status 200
    return res
        .status(200)
        .json(new ApiResponse(200, updated_playlist, "Video added to playlist successfully"))
})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params
    // TODO: remove video from playlist

    // validate videoId => if invalid, throw 400 via ApiError
    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }
    // helper function called (validates playlist id, checks it exists, checks ownership)
    await helper(playlistId, req.user._id)
    // remove the video from the videos array with $pull
    // decide: if the video was not in the playlist, treat it as success (the end state is what the client wanted)
    // update in one query (findByIdAndUpdate) with new: true so you get the updated playlist back
    const updated_playlist = await playlist.findByIdAndUpdate(
        playlistId,
        {$pull: {videos: videoId}},
        {new: true}
    )
    // return the updated playlist with status 200
    return res
        .status(200)
        .json(new ApiResponse(200, updated_playlist, "Video removed from playlist successfully"))
})

const deletePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    // TODO: delete playlist

    // helper function called (validates playlist id, checks it exists, checks ownership)
    await helper(playlistId, req.user._id)
    // delete the whole playlist document (not just its videos array)
    await playlist.findByIdAndDelete(playlistId)
    // return a success message with status 200 (data: an empty object, the client doesn't need the deleted playlist)
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Playlist deleted successfully"))
})

const updatePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    const {name, description} = req.body
    //TODO: update playlist
    // validate name and description: at least one must be sent; each one that is sent must be a non-empty string (trim it)
    if (name === undefined && description === undefined) {
        throw new ApiError(400, "Provide a name or a description to update")
    }
    // fields collects only what is being changed; owner and videos are never read from req.body
    const fields = {}
    if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
            throw new ApiError(400, "Playlist name must be a non-empty string")
        }
        fields.name = name.trim()
    }
    if (description !== undefined) {
        if (typeof description !== "string" || !description.trim()) {
            throw new ApiError(400, "Playlist description must be a non-empty string")
        }
        fields.description = description.trim()
    }
    // helper function called (validates playlist id, checks it exists, checks ownership)
    await helper(playlistId, req.user._id)
    // update in one query (findByIdAndUpdate) with new: true so you get the updated playlist back
    const updated_playlist = await playlist.findByIdAndUpdate(
        playlistId,
        {$set: fields},
        {new: true}
    )
    // return the updated playlist with status 200
    return res
        .status(200)
        .json(new ApiResponse(200, updated_playlist, "Playlist updated successfully"))
})

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}
