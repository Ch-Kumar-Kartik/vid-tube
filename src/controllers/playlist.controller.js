import mongoose, {isValidObjectId} from "mongoose"
import {Playlist as playlist} from "../models/playlist.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

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
    // decide: check the user exists (404), or just return an empty list for an unknown user
    // run an aggregation pipeline: match playlists whose owner is this user (convert userId to an ObjectId first)
    // decide what a list view needs: e.g. a video count ($size of videos) and maybe the first video's thumbnail
    // sort the playlists (e.g. newest first by createdAt)
    // return the playlists with status 200 (an empty array is fine, no error)
})

const getPlaylistById = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    //TODO: get playlist by id
    // validate playlistId => if invalid, throw 400 via ApiError (no ownership check: this is a read)
    // find the playlist => if not found, throw 404 via ApiError
    // the videos field holds only video ids: use populate or an aggregation with $lookup to return video details
    // decide: hide unpublished videos (isPublished: false) from the result?
    // decide: include the owner's username and avatar
    // return the playlist with status 200
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params

    // validate videoId => if invalid, throw 400 via ApiError (the helper only validates the playlist id)
    // import the Video model, then check the video exists => if not found, throw 404 via ApiError
    // helper function called (validates playlist id, checks it exists, checks ownership)
    // add the video so a duplicate is never added: use $addToSet instead of $push
    // update in one query (findByIdAndUpdate) with the new: true option so you get the updated playlist back
    // return the updated playlist with status 200
})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params
    // TODO: remove video from playlist

    // validate videoId => if invalid, throw 400 via ApiError
    // helper function called (validates playlist id, checks it exists, checks ownership)
    // remove the video from the videos array with $pull
    // decide: if the video was not in the playlist, treat it as success or throw 404
    // update in one query (findByIdAndUpdate) with new: true so you get the updated playlist back
    // return the updated playlist with status 200
})

const deletePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    // TODO: delete playlist

    // helper function called (validates playlist id, checks it exists, checks ownership)
    // delete the whole playlist document (not just its videos array)
    // return a success message with status 200 (decide what goes in data: an empty object or the deleted playlist)
})

const updatePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    const {name, description} = req.body
    //TODO: update playlist
    // validate name and description: at least one must be sent; each one that is sent must be a non-empty string (trim it)
    // helper function called (validates playlist id, checks it exists, checks ownership)
    // update only name and description: never take owner or videos from req.body
    // update in one query (findByIdAndUpdate) with new: true so you get the updated playlist back
    // return the updated playlist with status 200
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
