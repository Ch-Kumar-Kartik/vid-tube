import multer from "multer";

/*
    Express reads JSON and URL-encoded text on its own.
    A form that includes files is multipart/form-data, and Multer is what
    pulls those files out and saves them on disk.

    storage says where each file goes and what it is named:
    - destination saves it in ./public/temp
    - filename keeps the original name, such as "profile pic 2.png"

    multer({ storage }) creates the uploader. `storage` is shorthand for
    `storage: storage`, so Multer uses these disk settings instead of keeping
    the file in memory. The route calls upload.fields([...]) before
    registerUser. That accepts one avatar and one coverImage, writes them
    into public/temp, and puts their paths on req.files. The controller
    then reads req.files.avatar[0].path and uploads that local file to Cloudinary.
*/

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./public/temp")
    },
    filename: function (req, file, cb) {
      
      cb(null, file.originalname)
    }
  })
  
export const upload = multer({ 
    storage, 
})