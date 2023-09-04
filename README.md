# gif-to-ascii-pipeline

## Why?
I wanted a way to parse video/animation files and manipulate individual frames in real time. Node streams were a logical interface choice. I needed access to a test set of videos/animations and .gifs seemed like a good place to start. The file sizes are relatively small and there are large online resources such as [Giphy](https://giphy.com/)

## Decoding a .gif file
Although node packages already exist for decoding gifs, none used streams. Hence why I decided to write my own. The compressed file stream is decoded using the [Lempel–Ziv–Welch](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Welch) (LZW) algorithm. A pipeline transforms the file buffer into a stream of individual frames.

## Ascii transform
I have seen animations that use ascii characters in place of pixels and colours. I wanted to try and achieve this. First I transform the frame to a greyscale representation. A 1:1 pixel to character would be too large, so the image is then compressed. Finally, the compressed greyscale image is converted to ascii characters.

## In addition
Not all gifs are well suited to this. Typically gifs with sharp contrast between light and dark are better. But even still it can be hard to make out the original. For this reason I have included the original gif as a way to compare.
