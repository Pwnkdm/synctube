// youtube utils code
const extractVideoId = (url) => {
  const regex =
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

const validateYouTubeUrl = (url) => {
  return extractVideoId(url) !== null;
};

const getVideoMetadata = async (videoId) => {
  if (!process.env.YOUTUBE_API_KEY) return null;

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${process.env.YOUTUBE_API_KEY}&part=snippet,contentDetails`
    );
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const video = data.items[0];
      return {
        title: video.snippet.title,
        duration: video.contentDetails.duration,
        thumbnail: video.snippet.thumbnails.high.url,
        channelTitle: video.snippet.channelTitle,
      };
    }
  } catch (error) {
    console.error("Error fetching video metadata:", error);
  }

  return null;
};

module.exports = { extractVideoId, validateYouTubeUrl, getVideoMetadata };
