import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Users,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  MessageSquare,
  Send,
  Settings,
  LogOut,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";
import io from "socket.io-client";
import { Switch } from "./common/SwitchBtn";

const API_BASE = import.meta.env.VITE_APP_BASE_URL || "http://localhost:5000";

const YoutubeSyncPlatform = () => {
  // Authentication states
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [authMode, setAuthMode] = useState("login");
  const [authData, setAuthData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  // Room states
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomData, setRoomData] = useState({
    name: "",
    isPrivate: false,
  });
  const [joinRoomId, setJoinRoomId] = useState("");
  const [toggleRoom, setToggleRoom] = useState(false);

  // Video states
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  // Voice and chat states
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [showChat, setShowChat] = useState(true);

  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Refs
  const socketRef = useRef(null);
  const videoProgressRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    if (token && user) {
      socketRef.current = io(API_BASE, {
        auth: { token },
      });

      socketRef.current.on("connect", () => {
        console.log("Socket connected to server");
      });

      socketRef.current.on("room-joined", (data) => {
        console.log(data, "room-joined");

        setCurrentRoom(data.roomId);
        setConnectedUsers(data.connectedUsers);
        if (data.currentVideo.videoId) {
          setVideoId(data.currentVideo.videoId);
          setVideoTitle(data.currentVideo.title || "");
        }
        if (data.playState) {
          setIsPlaying(data.playState.isPlaying);
          setCurrentTime(data.playState.currentTime);
        }
      });

      socketRef.current.on("user-joined", (data) => {
        console.log(data, "poiuuih");

        setConnectedUsers((prev) => [
          ...prev,
          {
            userId: data.userId,
            username: data.username,
            voiceConnected: false,
          },
        ]);
      });

      socketRef.current.on("user-left", (data) => {
        setConnectedUsers((prev) =>
          prev.filter((user) => user.userId !== data.userId)
        );
      });

      socketRef.current.on("video-sync", (data) => {
        if (data.videoData) {
          setVideoId(data.videoData.videoId);
          setVideoTitle(data.videoData.title || "");
        }
        if (data.playState) {
          setIsPlaying(data.playState.isPlaying);
          setCurrentTime(data.playState.currentTime);
        }
      });

      console.log(chatMessages, "poiuyy");

      socketRef.current.on("new-message", (message) => {
        console.log(message, "socket message");

        setChatMessages((prev) => [
          ...prev,
          {
            ...message,
            timestamp: new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      });

      socketRef.current.on("voice-status-update", (data) => {
        setConnectedUsers((prev) =>
          prev.map((user) =>
            user.userId === data.userId
              ? { ...user, voiceConnected: data.voiceConnected }
              : user
          )
        );
      });

      socketRef.current.on("error", (data) => {
        setError(data.message);
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    }
  }, [token, user]);

  // Check for existing token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // API call helper
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

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      return data;
    } catch (error) {
      throw new Error(error.message);
    }
  };

  // Authentication handlers
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        authMode === "login"
          ? { email: authData.email, password: authData.password }
          : authData;

      const response = await apiCall(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setToken(response.token);
      setUser(response.user);
      localStorage.setItem("token", response.token);
      localStorage.setItem("user", JSON.stringify(response.user));

      setAuthData({ username: "", email: "", password: "" });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setToken(null);
    setUser(null);
    setCurrentRoom(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  // Room handlers
  const createRoom = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await apiCall("/api/rooms", {
        method: "POST",
        body: JSON.stringify(roomData),
      });
      const roomId = response.room.roomId;

      // Join the created room
      if (socketRef.current) {
        socketRef.current.emit("join-room", roomId);
        setCurrentRoom(roomId);
      }

      setRoomData({ name: "", isPrivate: false });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = (roomId) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit("join-room", roomId);
      setJoinRoomId("");
    }
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = io(API_BASE, { auth: { token } });
    }
    setCurrentRoom(null);
    setConnectedUsers([]);
    setChatMessages([]);
    setVideoId("");
    setVideoTitle("");
  };

  // Video handlers
  const extractVideoId = (url) => {
    const regex =
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const handleUrlSubmit = () => {
    const id = extractVideoId(youtubeUrl);
    if (id && socketRef.current && currentRoom) {
      const videoData = {
        videoId: id,
        url: youtubeUrl,
        title: videoTitle,
      };

      setVideoId(id);
      setCurrentTime(0);
      setIsPlaying(false);

      socketRef.current.emit("video-action", {
        roomId: currentRoom,
        action: "load-video",
        videoData,
        playState: { isPlaying: false, currentTime: 0 },
      });

      setYoutubeUrl("");
    }
  };

  const handlePlayPause = () => {
    const newPlayState = !isPlaying;
    setIsPlaying(newPlayState);

    if (socketRef.current && currentRoom) {
      socketRef.current.emit("video-action", {
        roomId: currentRoom,
        action: newPlayState ? "play" : "pause",
        playState: {
          isPlaying: newPlayState,
          currentTime: currentTime,
        },
      });
    }
  };

  // Chat handlers
  const sendMessage = () => {
    if (newMessage.trim() && socketRef.current && currentRoom) {
      socketRef.current.emit("send-message", {
        roomId: currentRoom,
        message: newMessage,
      });
      setNewMessage("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  // Voice handlers
  const toggleVoiceCall = () => {
    const newStatus = !isVoiceConnected;
    setIsVoiceConnected(newStatus);

    if (socketRef.current && currentRoom) {
      socketRef.current.emit("voice-toggle", {
        roomId: currentRoom,
        isConnected: newStatus,
      });
    }
  };

  const toggleMic = () => {
    setIsMicMuted(!isMicMuted);
  };

  // Format time helper
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Login/Register Form
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <h1
              style={{ fontFamily: "Oswald" }}
              className="text-3xl font-bold text-red-500 mb-2"
            >
              BingeSync
            </h1>
            <p className="text-gray-400">Watch YouTube together with friends</p>
          </div>

          {error && (
            <div className="bg-red-600 text-white p-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="flex mb-6">
            <button
              onClick={() => setAuthMode("login")}
              className={`flex-1 py-2 px-4 rounded-l ${
                authMode === "login" ? "bg-red-600" : "bg-gray-700"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode("register")}
              className={`flex-1 py-2 px-4 rounded-r ${
                authMode === "register" ? "bg-red-600" : "bg-gray-700"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === "register" && (
              <input
                type="text"
                placeholder="Username"
                value={authData.username}
                onChange={(e) =>
                  setAuthData({ ...authData, username: e.target.value })
                }
                className="w-full bg-gray-700 text-white px-4 py-3 rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={authData.email}
              onChange={(e) =>
                setAuthData({ ...authData, email: e.target.value })
              }
              className="w-full bg-gray-700 text-white px-4 py-3 rounded border border-gray-600 focus:border-red-500 focus:outline-none"
              required
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={authData.password}
                onChange={(e) =>
                  setAuthData({ ...authData, password: e.target.value })
                }
                className="w-full bg-gray-700 text-white px-4 py-3 rounded border border-gray-600 focus:border-red-500 focus:outline-none pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 py-3 rounded font-semibold transition-colors"
            >
              {loading
                ? "Please wait..."
                : authMode === "login"
                ? "Login"
                : "Register"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Room selection screen
  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <header className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h1
              className="text-2xl font-bold text-red-500"
              style={{ fontFamily: "Oswald" }}
            >
              BingeSync
            </h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">
                Welcome, {user.username}
              </span>
              <button
                onClick={handleLogout}
                className="bg-gray-600 hover:bg-gray-700 p-2 rounded transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto p-6">
          {error && (
            <div className="bg-red-600 text-white p-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="min-h-screen bg-gray-900 text-white p-8">
            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-1 gap-8">
                {!toggleRoom ? (
                  <div className="bg-gray-800 p-6 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center">
                        <UserPlus className="mr-2" size={20} />
                        <span className="text-xl font-semibold">
                          Create New Room
                        </span>
                      </div>
                      <Switch
                        checked={toggleRoom}
                        onChange={() => setToggleRoom(!toggleRoom)}
                        size="sm"
                        label="Toggle between create and join room"
                        showLabels={false}
                      />
                    </div>

                    <form onSubmit={createRoom} className="space-y-4">
                      <input
                        type="text"
                        placeholder="Room name"
                        value={roomData.name}
                        onChange={(e) =>
                          setRoomData({ ...roomData, name: e.target.value })
                        }
                        className="w-full bg-gray-700 text-white px-4 py-3 rounded border border-gray-600 focus:border-blue-300 focus:outline-none"
                        required
                      />

                      <label className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={roomData.isPrivate}
                          onChange={(e) =>
                            setRoomData({
                              ...roomData,
                              isPrivate: e.target.checked,
                            })
                          }
                          className="rounded"
                        />
                        <span>Make room private</span>
                      </label>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-400 hover:bg-blue-600 disabled:bg-gray-600 py-3 rounded font-semibold transition-colors"
                      >
                        {loading ? "Creating..." : "Create Room"}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="bg-gray-800 p-6 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center">
                        <Users className="mr-2" size={20} />
                        <span className="text-xl font-semibold">
                          Join Existing Room
                        </span>
                      </div>
                      <Switch
                        checked={toggleRoom}
                        onChange={() => setToggleRoom(!toggleRoom)}
                        size="sm"
                        label="Toggle between create and join room"
                        showLabels={false}
                      />
                    </div>

                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Enter room ID"
                        value={joinRoomId}
                        onChange={(e) => setJoinRoomId(e.target.value)}
                        className="w-full bg-gray-700 text-white px-4 py-3 rounded border border-gray-600 focus:border-blue-300 focus:outline-none"
                      />

                      <button
                        onClick={() => joinRoom(joinRoomId)}
                        disabled={!joinRoomId.trim()}
                        className="w-full bg-blue-400 hover:bg-blue-600 disabled:bg-gray-600 py-3 rounded font-semibold transition-colors"
                      >
                        Join Room
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main application interface
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-red-500">SyncTube</h1>
            <span className="text-sm text-gray-400">Room: {currentRoom}</span>
          </div>

          {/* Voice Controls */}
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleMic}
              className={`p-2 rounded-full ${
                isMicMuted
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              } transition-colors`}
              title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
              onClick={toggleVoiceCall}
              className={`p-2 rounded-full ${
                isVoiceConnected
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              } transition-colors`}
              title={isVoiceConnected ? "Leave voice chat" : "Join voice chat"}
            >
              {isVoiceConnected ? <PhoneOff size={20} /> : <Phone size={20} />}
            </button>

            <div className="flex items-center space-x-2 text-sm">
              <Users size={16} />
              <span>{connectedUsers.length} online</span>
            </div>

            <button
              onClick={leaveRoom}
              className="bg-gray-600 hover:bg-gray-700 p-2 rounded transition-colors"
              title="Leave room"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Video Area */}
          <div className="lg:col-span-3 space-y-4">
            {/* YouTube URL Input */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Paste YouTube URL here..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!youtubeUrl.trim()}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 px-4 py-2 rounded transition-colors"
                >
                  Load Video
                </button>
              </div>
              {videoTitle && (
                <div className="mt-2 text-sm text-gray-300">
                  Current: {videoTitle}
                </div>
              )}
            </div>

            {/* Video Player */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="aspect-video bg-black flex items-center justify-center relative">
                {videoId ? (
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0"
                  ></iframe>
                ) : (
                  <div className="text-gray-400 text-center">
                    <div className="text-4xl mb-2">📺</div>
                    <div>No video loaded</div>
                    <div className="text-sm">
                      Paste a YouTube URL above to get started
                    </div>
                  </div>
                )}

                {/* Sync Status Overlay */}
                <div className="absolute top-4 right-4 bg-black bg-opacity-50 px-3 py-1 rounded text-sm">
                  {isVoiceConnected && (
                    <span className="text-green-400 mr-2">🔊 Voice Active</span>
                  )}
                  <span className="text-blue-400">⚡ Synced</span>
                </div>
              </div>

              {/* Video Controls */}
              <div className="p-4 space-y-3">
                {/* Progress Bar */}
                <div className="flex items-center space-x-3 text-sm">
                  <span>{formatTime(currentTime)}</span>
                  <div
                    className="flex-1 bg-gray-700 rounded-full h-2 cursor-pointer relative"
                    ref={videoProgressRef}
                  >
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width:
                          duration > 0
                            ? `${(currentTime / duration) * 100}%`
                            : "0%",
                      }}
                    ></div>
                  </div>
                  <span>{formatTime(duration)}</span>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handlePlayPause}
                      disabled={!videoId}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 p-3 rounded-full transition-colors"
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>

                    <div className="flex items-center space-x-2">
                      <button onClick={() => setIsMuted(!isMuted)}>
                        {isMuted ? (
                          <VolumeX size={20} />
                        ) : (
                          <Volume2 size={20} />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => setVolume(parseInt(e.target.value))}
                        className="w-20"
                      />
                    </div>
                  </div>

                  <div className="text-sm text-gray-400">
                    Synced with {Math.max(0, connectedUsers.length - 1)} others
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Connected Users */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="font-semibold mb-3 flex items-center">
                <Users size={16} className="mr-2" />
                Connected Users ({connectedUsers.length})
              </h3>
              <div className="space-y-2">
                {connectedUsers.map((connectedUser, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                      {connectedUser.username === user.username
                        ? "You"
                        : connectedUser.username}
                    </span>
                    {connectedUser.voiceConnected && (
                      <div className="text-green-400">
                        <Volume2 size={12} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className="bg-gray-800 rounded-lg flex flex-col h-96">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="font-semibold flex items-center">
                  <MessageSquare size={16} className="mr-2" />
                  Chat
                </h3>
                <button
                  onClick={() => setShowChat(!showChat)}
                  className="text-gray-400 hover:text-white"
                >
                  <Settings size={16} />
                </button>
              </div>

              {showChat && (
                <>
                  {/* Messages */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3">
                    {chatMessages.map((msg) => (
                      <div key={msg._id} className="text-sm">
                        <div className="flex items-center space-x-2 mb-1">
                          <span
                            className={`font-semibold ${
                              msg.messageType === "system"
                                ? "text-yellow-400"
                                : "text-blue-400"
                            }`}
                          >
                            {msg.sender}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {msg.timestamp}
                          </span>
                        </div>
                        <p
                          className={`${
                            msg.messageType === "system"
                              ? "text-yellow-200 italic"
                              : "text-gray-200"
                          }`}
                        >
                          {msg.content}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-gray-700">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="flex-1 bg-gray-700 text-white px-3 py-2 rounded text-sm border border-gray-600 focus:border-red-500 focus:outline-none"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 p-2 rounded transition-colors"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Voice Status Bar */}
      {isVoiceConnected && (
        <div className="fixed bottom-0 left-0 right-0 bg-green-600 text-white p-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="animate-pulse">
                <Mic size={16} />
              </div>
              <span className="text-sm">
                Voice chat active •{" "}
                {connectedUsers.filter((u) => u.voiceConnected).length}{" "}
                participants
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMic}
                className={`p-1 rounded ${
                  isMicMuted ? "bg-red-500" : "bg-green-700"
                }`}
              >
                {isMicMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <button
                onClick={toggleVoiceCall}
                className="p-1 rounded bg-red-500 hover:bg-red-600"
              >
                <PhoneOff size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YoutubeSyncPlatform;
