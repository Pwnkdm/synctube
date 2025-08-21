import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, Crown } from "lucide-react";
import io from "socket.io-client";

const API_BASE = import.meta.env.VITE_APP_BASE_URL || "http://localhost:5000";

const Switch = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`w-10 h-5 flex items-center rounded-full p-1 ${
      checked ? "bg-blue-600" : "bg-gray-600"
    }`}
  >
    <div
      className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${
        checked ? "translate-x-5" : ""
      }`}
    />
  </button>
);

const YoutubeSyncPlatform = () => {
  // Auth
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [authMode, setAuthMode] = useState("login");
  const [authData, setAuthData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");

  // Room
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomData, setRoomData] = useState({ name: "", isPrivate: false });
  const [joinRoomId, setJoinRoomId] = useState("");
  const [toggleRoom, setToggleRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [hostInfo, setHostInfo] = useState(null);
  const [roomSettings, setRoomSettings] = useState({
    allowGuestControl: false,
  });

  // Video
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(50);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [videoUrl, setVideoUrl] = useState(""); // full URL passed to ReactPlayer
  const [videoTitle, setVideoTitle] = useState("");
  const [playerError, setPlayerError] = useState("");

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  // UI misc
  const [controlError, setControlError] = useState("");
  const [socketError, setSocketError] = useState("");

  const playerRef = useRef(null);
  const socketRef = useRef(null);

  const canControlVideo = isHost || roomSettings.allowGuestControl;

  // Restore session
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Socket init + listeners
  useEffect(() => {
    if (!token || !user) return;

    const s = io(API_BASE, { auth: { token } });
    socketRef.current = s;

    s.on("room-joined", (data) => {
      console.log("🏠 Room joined:", data);
      setCurrentRoom(data.roomId);
      setIsHost(Boolean(data.isHost));
      setHostInfo(data.hostInfo);
      setRoomSettings(data.roomSettings || { allowGuestControl: false });

      if (data.currentVideo?.url) {
        console.log("🎬 Loading existing video:", data.currentVideo.url);
        setVideoUrl(data.currentVideo.url);
        setVideoId(data.currentVideo.videoId || "");
        setVideoTitle(data.currentVideo.title || "");
      }

      if (data.playState) {
        console.log("▶️ Setting initial play state:", data.playState);
        setIsPlaying(Boolean(data.playState.isPlaying));
        setCurrentTime(Number(data.playState.currentTime || 0));
      }

      s.emit("get-messages", data.roomId);
    });

    // Video sync (load/play/pause/seek/sync)
    s.on("video-sync", (data) => {
      console.log("🔄 Video sync received:", data);

      if (data.videoData?.url) {
        console.log("📺 Syncing video to:", data.videoData.url);
        setVideoUrl(data.videoData.url);
        setVideoId(data.videoData.videoId || "");
        setVideoTitle(data.videoData.title || "");
      }

      if (data.playState) {
        const t = Number(data.playState.currentTime || 0);
        const playing = Boolean(data.playState.isPlaying);
        console.log("⏰ Syncing time to:", t, "playing:", playing);

        setIsPlaying(playing);
        setCurrentTime(t);

        // Update iframe if time changed significantly (seek operation)
        if (Math.abs(t - currentTime) > 3 && videoId) {
          const iframe = document.querySelector(
            'iframe[src*="youtube.com/embed"]'
          );
          if (iframe) {
            const newSrc = `https://www.youtube.com/embed/${videoId}?autoplay=${
              playing ? 1 : 0
            }&controls=0&rel=0&enablejsapi=1&origin=${
              window.location.origin
            }&start=${Math.floor(t)}`;
            iframe.src = newSrc;
          }
        }
      }
    });

    // Chat events: matches your backend
    s.on("new-message", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    s.on("messages-history", (msgs) => {
      setChatMessages(msgs || []);
    });

    // Room settings + host transfer
    s.on("room-settings-updated", (data) => {
      setRoomSettings((prev) => ({
        ...prev,
        allowGuestControl: data.allowGuestControl,
      }));
    });

    s.on("host-transferred", (data) => {
      setHostInfo(data.newHost);
      setIsHost(data.newHost?.userId === user.id);
    });

    // Errors
    s.on("error", (data) => {
      if (data?.code === "HOST_CONTROL_REQUIRED") {
        setControlError("Only the host can control video playback");
        setTimeout(() => setControlError(""), 2500);
      } else if (data?.message) {
        setSocketError(data.message);
        setTimeout(() => setSocketError(""), 3000);
      }
    });

    return () => {
      s.disconnect();
    };
  }, [token, user]);

  // API helper
  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };
    const res = await fetch(url, config);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    return data;
  };

  // Auth
  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        authMode === "login"
          ? { email: authData.email, password: authData.password }
          : authData;
      const res = await apiCall(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
    } catch (err) {
      setError(err.message);
    }
  };

  // Room
  const createRoom = async (e) => {
    e.preventDefault();
    try {
      const res = await apiCall("/api/rooms", {
        method: "POST",
        body: JSON.stringify(roomData),
      });
      if (socketRef.current && res?.room?.roomId) {
        socketRef.current.emit("join-room", res.room.roomId);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const joinRoom = (id) => {
    if (!id?.trim()) return;
    socketRef.current?.emit("join-room", id.trim());
  };

  // Video helpers
  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s]+)/,
      /youtube\.com\/watch\?.*v=([^&?\s]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return "";
  };

  const handleUrlSubmit = async () => {
    console.log("=== handleUrlSubmit called ===");
    setPlayerError("");

    if (!canControlVideo) {
      setControlError("Only host can load videos");
      return;
    }

    const raw = youtubeUrl.trim();
    console.log("Raw input:", raw);

    if (!raw) return;

    const id = extractVideoId(raw);
    console.log("Extracted video ID:", id);

    if (!id) {
      setPlayerError("Invalid YouTube URL");
      return;
    }

    const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
    console.log("🎯 Loading video:", cleanUrl);

    // Set default duration (you can fetch real duration from YouTube API if needed)
    setDuration(300); // 5 minutes default, or implement YouTube API call

    // Update local state IMMEDIATELY for host
    setVideoUrl(cleanUrl);
    setVideoId(id);
    setVideoTitle(videoTitle || `Video ${id}`);
    setIsPlaying(false);
    setCurrentTime(0);

    // ALSO emit to socket for other users
    socketRef.current?.emit("video-action", {
      roomId: currentRoom,
      action: "load-video",
      videoData: {
        videoId: id,
        url: cleanUrl,
        title: videoTitle || `Video ${id}`,
      },
      playState: { isPlaying: false, currentTime: 0 },
    });

    setYoutubeUrl("");
    console.log("✅ Video state updated locally and broadcasted");
  };

  const handlePlayPause = () => {
    if (!canControlVideo)
      return setControlError("Only host can control video playback");

    const newState = !isPlaying;
    setIsPlaying(newState);

    // Emit to socket for sync
    socketRef.current?.emit("video-action", {
      roomId: currentRoom,
      action: newState ? "play" : "pause",
      playState: { isPlaying: newState, currentTime },
    });

    // Force iframe reload with new autoplay state
    if (videoId) {
      const iframe = document.querySelector('iframe[src*="youtube.com/embed"]');
      if (iframe) {
        const newSrc = `https://www.youtube.com/embed/${videoId}?autoplay=${
          newState ? 1 : 0
        }&controls=0&rel=0&enablejsapi=1&origin=${
          window.location.origin
        }&start=${Math.floor(currentTime)}`;
        iframe.src = newSrc;
      }
    }
  };

  const handleSeek = (newTime) => {
    if (!canControlVideo) {
      setControlError("Only host can seek video");
      return;
    }

    console.log("🔍 Seeking to:", newTime);
    setCurrentTime(newTime);

    // Update iframe with new start time
    if (videoId) {
      const iframe = document.querySelector('iframe[src*="youtube.com/embed"]');
      if (iframe) {
        const newSrc = `https://www.youtube.com/embed/${videoId}?autoplay=${
          isPlaying ? 1 : 0
        }&controls=0&rel=0&enablejsapi=1&origin=${
          window.location.origin
        }&start=${Math.floor(newTime)}`;
        iframe.src = newSrc;
      }
    }

    // Emit seek to other users
    socketRef.current?.emit("video-action", {
      roomId: currentRoom,
      action: "seek",
      playState: { isPlaying, currentTime: newTime },
    });
  };

  const onPlayerReady = () => {
    if (playerRef.current && currentTime > 0) {
      try {
        playerRef.current.seekTo(currentTime, "seconds");
      } catch {}
    }
  };

  const onPlayerError = (e) => {
    setPlayerError(
      "This URL couldn't be loaded. Make sure it's a public, playable YouTube link."
    );
    console.error("ReactPlayer error:", e);
  };

  const formatTime = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Chat
  const sendMessage = () => {
    if (!newMessage.trim() || !currentRoom) return;
    socketRef.current?.emit("send-message", {
      roomId: currentRoom,
      message: newMessage.trim(),
    });
    setNewMessage(""); // server will broadcast "new-message"
  };

  // -------------------- UI --------------------
  if (!user) {
    return (
      <div className="p-6 text-white max-w-md mx-auto">
        <h2 className="text-3xl font-bold text-red-500 mb-2">BingeSync</h2>
        {error && <p className="text-red-400">{error}</p>}
        <div className="flex mb-4">
          <button
            onClick={() => setAuthMode("login")}
            className={`flex-1 py-2 ${
              authMode === "login" ? "bg-red-600" : "bg-gray-700"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setAuthMode("register")}
            className={`flex-1 py-2 ${
              authMode === "register" ? "bg-red-600" : "bg-gray-700"
            }`}
          >
            Register
          </button>
        </div>
        <form onSubmit={handleAuth}>
          {authMode === "register" && (
            <input
              type="text"
              placeholder="Username"
              value={authData.username}
              onChange={(e) =>
                setAuthData({ ...authData, username: e.target.value })
              }
              className="w-full mb-2 bg-gray-700 px-3 py-2"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={authData.email}
            onChange={(e) =>
              setAuthData({ ...authData, email: e.target.value })
            }
            className="w-full mb-2 bg-gray-700 px-3 py-2"
          />
          <input
            type="password"
            placeholder="Password"
            value={authData.password}
            onChange={(e) =>
              setAuthData({ ...authData, password: e.target.value })
            }
            className="w-full mb-2 bg-gray-700 px-3 py-2"
          />
          <button type="submit" className="w-full bg-red-600 py-2">
            {authMode === "login" ? "Login" : "Register"}
          </button>
        </form>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="p-6 text-white max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-red-500">
          Welcome {user.username}
        </h2>
        {!toggleRoom ? (
          <form onSubmit={createRoom} className="mt-4">
            <input
              type="text"
              placeholder="Room name"
              value={roomData.name}
              onChange={(e) =>
                setRoomData({ ...roomData, name: e.target.value })
              }
              className="w-full mb-2 bg-gray-700 px-3 py-2"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={roomData.isPrivate}
                onChange={(e) =>
                  setRoomData({ ...roomData, isPrivate: e.target.checked })
                }
              />
              Private Room
            </label>
            <button type="submit" className="w-full bg-blue-500 py-2 mt-2">
              Create Room
            </button>
          </form>
        ) : (
          <div className="mt-4">
            <input
              type="text"
              placeholder="Enter room ID"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              className="w-full mb-2 bg-gray-700 px-3 py-2"
            />
            <button
              onClick={() => joinRoom(joinRoomId)}
              className="w-full bg-blue-500 py-2"
            >
              Join Room
            </button>
          </div>
        )}
        <div className="mt-2">
          <Switch
            checked={toggleRoom}
            onChange={() => setToggleRoom(!toggleRoom)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white grid grid-cols-3 gap-4">
      {/* Left: Video Section */}
      <div className="col-span-2">
        <h2 className="text-xl font-bold text-red-500">Room {currentRoom}</h2>
        {hostInfo && (
          <p>
            Host: {hostInfo.username}{" "}
            {isHost && <Crown className="inline w-4 h-4 text-yellow-400" />}
          </p>
        )}
        {controlError && <p className="text-red-400">{controlError}</p>}
        {socketError && <p className="text-red-400">{socketError}</p>}

        {/* URL Input */}
        <div className="flex gap-2 mt-4">
          <input
            type="text"
            placeholder={
              canControlVideo
                ? "Paste a YouTube URL (watch / youtu.be / embed)..."
                : "Only host can load videos..."
            }
            disabled={!canControlVideo}
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="flex-1 bg-gray-700 px-3 py-2 rounded"
          />
          <button
            onClick={handleUrlSubmit}
            disabled={!youtubeUrl.trim() || !canControlVideo}
            className="bg-red-600 px-4 py-2 rounded"
          >
            Load
          </button>
        </div>

        {/* YouTube Player */}
        <div className="mt-4">
          {!videoUrl ? (
            <div className="bg-gray-700 h-96 flex items-center justify-center">
              <p className="text-gray-400">No video loaded</p>
            </div>
          ) : (
            <div className="bg-black">
              <p className="text-white text-xs p-2">Loading: {videoUrl}</p>
              <div
                className="relative w-full"
                style={{ paddingBottom: "56.25%" }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=${
                    isPlaying ? 1 : 0
                  }&controls=0&rel=0&enablejsapi=1&origin=${
                    window.location.origin
                  }&start=${Math.floor(currentTime)}`}
                  className="absolute top-0 left-0 w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube Video Player"
                />
              </div>

              {/* Custom Timeline */}
              <div className="mt-2 px-2">
                <div className="flex items-center gap-2 text-white text-sm">
                  <span className="min-w-[40px]">
                    {formatTime(currentTime)}
                  </span>
                  <div className="flex-1 relative">
                    <input
                      type="range"
                      min="0"
                      max={duration || 100}
                      value={currentTime}
                      onChange={(e) => {
                        if (!canControlVideo) {
                          setControlError("Only host can seek video");
                          return;
                        }
                        const newTime = parseInt(e.target.value);
                        handleSeek(newTime);
                      }}
                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${
                          (currentTime / duration) * 100
                        }%, #6b7280 ${
                          (currentTime / duration) * 100
                        }%, #6b7280 100%)`,
                      }}
                    />
                  </div>
                  <span className="min-w-[40px]">{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          )}
          {playerError && (
            <p className="text-red-400 mt-2">ERROR: {playerError}</p>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 flex gap-2 items-center">
          <button
            onClick={handlePlayPause}
            disabled={!canControlVideo || !videoUrl}
            className="bg-red-600 p-3 rounded-full"
          >
            {isPlaying ? <Pause /> : <Play />}
          </button>
          <button onClick={() => setIsMuted(!isMuted)} disabled={!videoUrl}>
            {isMuted ? <VolumeX /> : <Volume2 />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseInt(e.target.value))}
            disabled={!videoUrl}
          />
          <button
            onClick={() => {
              console.log("Direct state test");
              setVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
              setVideoId("dQw4w9WgXcQ");
              setVideoTitle("Test Video");
            }}
            className="bg-green-600 px-4 py-2 rounded ml-2"
          >
            Direct Test
          </button>
        </div>
      </div>

      {/* Right: Chat Section */}
      <div className="col-span-1 flex flex-col bg-gray-800 rounded-lg p-3">
        <h3 className="text-lg font-bold mb-2">Chat</h3>
        <div className="flex-1 overflow-y-auto space-y-2 mb-2">
          {chatMessages.map((msg) => (
            <div
              key={msg._id || `${msg.timestamp}-${msg.sender}-${msg.content}`}
              className={`p-2 rounded ${
                msg.messageType === "system" ? "bg-gray-600" : "bg-gray-700"
              }`}
            >
              <div className="text-xs opacity-70">
                {new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
              </div>
              <div>
                <span
                  className={`font-semibold ${
                    msg.messageType === "system" ? "text-yellow-300" : ""
                  }`}
                >
                  {msg.messageType === "system" ? "System" : msg.sender}
                </span>
                {msg.messageType !== "system" && <span>: </span>}
                <span>{msg.content}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            className="flex-1 bg-gray-700 px-3 py-2 rounded"
          />
          <button onClick={sendMessage} className="bg-blue-600 px-4 rounded">
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default YoutubeSyncPlatform;
