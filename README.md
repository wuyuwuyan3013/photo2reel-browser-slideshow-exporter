# Browser Photo Slideshow Exporter

A dependency-free browser demo for turning multiple local images and an optional local audio track into a downloadable slideshow video.

The working version of this tool is used by [Photo2Reel](https://photo2reel.com/).

## What it does

- accepts multiple image files and lets the user reorder them
- sets a display duration for each image
- accepts a local audio file or a small built-in tone
- draws frames to a `1280 × 720` canvas
- records the canvas with `MediaRecorder`
- downloads the finished video without sending images or audio to a server

## Run it

This is a static page. Open `index.html` in a current Chromium-based browser, or serve the directory from any static host.

For local testing, start a static web server in this directory and open the shown local URL. Add images, choose optional audio, then select **Create video**. A successful run reveals a **Download video** link.

## Browser output

The page checks browser-supported `MediaRecorder` MIME types. Chrome and Edge normally export WebM; a browser that exposes a compatible MP4 recorder may export MP4 instead. File encoding is performed locally in the active browser session.

## Privacy model

The page has no upload request, account system, database, or backend. Selected files are read in the browser and are cleared when the session is refreshed or closed.

## Limitations

- long projects use the device's CPU and memory
- export format depends on the browser's media-recorder support
- the current layout is fixed to 16:9 / 1280 × 720

## License

MIT. See [LICENSE](LICENSE).
