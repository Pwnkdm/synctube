// room utils code
const generateRoomId = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

const calculateSyncTime = (lastUpdate, currentTime, isPlaying) => {
  if (!isPlaying) return currentTime;

  const timeDiff = (Date.now() - new Date(lastUpdate).getTime()) / 1000;
  return currentTime + timeDiff;
};

module.exports = { generateRoomId, calculateSyncTime };
