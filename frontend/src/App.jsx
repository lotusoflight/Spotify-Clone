import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Home,
  Search,
  Library,
  Plus,
  Heart,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Music2,
  Shuffle,
  Repeat,
  Headphones,
  Radio,
  AlertCircle,
  ExternalLink,
  User,
  Check,
  Disc,
  Mic,
  ArrowLeft,
  LogOut,
  Save,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login/") &&
      !originalRequest.url?.includes("/auth/refresh/") &&
      !originalRequest.url?.includes("/auth/register/")
    ) {
      originalRequest._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.dispatchEvent(new Event("auth-expired"));
        return Promise.reject(error);
      }
      try {
        if (!refreshRequest) {
          refreshRequest = axios
            .post(`${API}/auth/refresh/`, { refresh })
            .then((r) => {
              localStorage.setItem("access_token", r.data.access);
              return r.data.access;
            })
            .finally(() => {
              refreshRequest = null;
            });
        }
        const newToken = await refreshRequest;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (e) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.dispatchEvent(new Event("auth-expired"));
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  },
);

// Spotify URL Validator & Parser
function parseSpotifyUrl(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Spotify URI format (e.g. spotify:track:4cOdK2wGLETKBW3PvgPWqT)
  const uriMatch = trimmed.match(
    /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/,
  );
  if (uriMatch) {
    return {
      type: uriMatch[1],
      id: uriMatch[2],
      embedUrl: `https://open.spotify.com/embed/${uriMatch[1]}/${uriMatch[2]}?utm_source=generator`,
    };
  }

  // HTTPS Web URLs
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.hostname !== "open.spotify.com" &&
      parsed.hostname !== "www.open.spotify.com"
    ) {
      return null;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] && segments[0].startsWith("intl-")) {
      segments.shift();
    }
    if (segments.length >= 2) {
      const type = segments[0];
      const id = segments[1];
      const validTypes = [
        "track",
        "album",
        "playlist",
        "artist",
        "episode",
        "show",
      ];
      if (validTypes.includes(type) && /^[A-Za-z0-9]+$/.test(id)) {
        return {
          type,
          id,
          embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

const SPOTIFY_PRESETS = [
  {
    name: "Tamil Hits",
    url: "https://open.spotify.com/playlist/37i9dQZF1DX4Wsb4d7NKfP",
  },
  {
    name: "A.R. Rahman",
    url: "https://open.spotify.com/playlist/37i9dQZF1DZ06evO2OcxjY",
  },
  {
    name: "Anirudh Hits",
    url: "https://open.spotify.com/playlist/37i9dQZF1DZ06evO37yV6A",
  },
  {
    name: "Global Top 50",
    url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  },
];

const SEARCH_BROWSE_CARDS = [
  { title: "Tamil Melodies", query: "Tamil", color: "from-blue-600 to-indigo-900" },
  { title: "A.R. Rahman Hits", query: "Rahman", color: "from-emerald-600 to-teal-900" },
  { title: "Anirudh Ravichander", query: "Anirudh", color: "from-rose-600 to-red-950" },
  { title: "Movie Soundtracks", query: "OST", color: "from-purple-600 to-violet-950" },
];

function App() {
  // Navigation View: "home" | "search" | "spotify" | "profile" | "favorites" | "playlist"
  const [currentView, setCurrentView] = useState("home");

  // Core Data States
  const [songs, setSongs] = useState([]);
  const [query, setQuery] = useState("");
  const [currentSong, setCurrentSong] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playlistName, setPlaylistName] = useState("");
  const [showPlaylistForm, setShowPlaylistForm] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [message, setMessage] = useState("");

  // Player controls
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off");

  // Authentication States
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [loggedIn, setLoggedIn] = useState(
    Boolean(localStorage.getItem("access_token")),
  );
  const [authLoading, setAuthLoading] = useState(false);

  // User Profile States
  const [userProfile, setUserProfile] = useState({
    id: null,
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    date_joined: "",
  });
  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  // Dedicated Search UI States
  const [searchCategory, setSearchCategory] = useState("all"); // "all", "songs", "artists", "albums", "playlists"
  const [searchResults, setSearchResults] = useState({
    songs: [],
    artists: [],
    albums: [],
    playlists: [],
    total_count: 0,
  });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Spotify Embed & 403 States
  const [spotifyUrlInput, setSpotifyUrlInput] = useState("");
  const [activeEmbedUrl, setActiveEmbedUrl] = useState(
    "https://open.spotify.com/embed/playlist/37i9dQZF1DX4Wsb4d7NKfP?utm_source=generator",
  );
  const [embedError, setEmbedError] = useState("");

  // Initial Load
  useEffect(() => {
    loadSongs();
    if (loggedIn) {
      loadUserData();
      loadUserProfile();
    }
  }, [loggedIn]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (currentSong?.audio_url && audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => setPlaying(false));
    }
  }, [currentSong]);

  useEffect(() => {
    const handleExpired = () => {
      setLoggedIn(false);
      setFavorites([]);
      setPlaylists([]);
      setPlaylistSongs([]);
      setSelectedPlaylist(null);
      setUserProfile({ id: null, username: "", email: "", first_name: "", last_name: "", date_joined: "" });
      setCurrentView("home");
      setMessage("Session expired. Please log in again.");
    };
    window.addEventListener("auth-expired", handleExpired);
    return () => window.removeEventListener("auth-expired", handleExpired);
  }, []);

  // Fetch local library songs
  async function loadSongs(search = "") {
    try {
      const res = await api.get("/songs/", {
        params: search ? { q: search } : {},
      });
      setSongs(res.data);
    } catch {
      setMessage("Cannot connect to Django backend");
    }
  }

  // Fetch user playlists and favorites
  async function loadUserData() {
    try {
      const [plRes, favRes] = await Promise.all([
        api.get("/playlists/"),
        api.get("/songs/favorites/"),
      ]);
      setPlaylists(plRes.data);
      setFavorites(favRes.data.map((s) => s.id));
    } catch {
      setMessage("Session expired. Login again.");
    }
  }

  // Fetch logged-in user's profile
  async function loadUserProfile() {
    if (!localStorage.getItem("access_token")) return;
    setProfileLoading(true);
    setProfileError("");
    try {
      const res = await api.get("/auth/profile/");
      setUserProfile(res.data);
      setProfileForm({
        first_name: res.data.first_name || "",
        last_name: res.data.last_name || "",
        email: res.data.email || "",
      });
    } catch {
      setProfileError("Could not load user profile details.");
    } finally {
      setProfileLoading(false);
    }
  }

  // Update user profile safely
  async function handleProfileUpdate(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");
    try {
      const res = await api.patch("/auth/profile/", profileForm);
      setUserProfile(res.data);
      setProfileMessage("Profile updated successfully! (விவரங்கள் மாற்றப்பட்டன)");
    } catch (err) {
      const msg =
        err.response?.data?.email?.[0] ||
        err.response?.data?.error ||
        "Could not update profile details.";
      setProfileError(msg);
    } finally {
      setProfileSaving(false);
    }
  }

  // Unified Search (Songs, Artists, Albums, Playlists)
  async function executeSearch(searchQuery) {
    const q = (searchQuery !== undefined ? searchQuery : query).trim();
    if (!q) {
      setSearchResults({
        songs: [],
        artists: [],
        albums: [],
        playlists: [],
        total_count: 0,
      });
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await api.get("/search/", { params: { q } });
      setSearchResults(res.data);
    } catch {
      setSearchError("Failed to fetch search results from Django.");
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSearchInputChange(v) {
    setQuery(v);
    // Check if user pasted a Spotify link into the search bar
    const detected = parseSpotifyUrl(v);
    if (detected) {
      setActiveEmbedUrl(detected.embedUrl);
      setCurrentView("spotify");
      setEmbedError("");
      setMessage("Spotify link detected! Opened in Spotify Embed Player.");
      if (audioRef.current) audioRef.current.pause();
      setPlaying(false);
      return;
    }

    if (currentView !== "search") {
      setCurrentView("search");
    }
    executeSearch(v);
  }

  // Authentication Handlers
  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthLoading(true);
    setMessage("");
    try {
      if (authMode === "register") await api.post("/auth/register/", authForm);
      const res = await api.post("/auth/login/", {
        username: authForm.username,
        password: authForm.password,
      });
      localStorage.setItem("access_token", res.data.access);
      localStorage.setItem("refresh_token", res.data.refresh);
      setLoggedIn(true);
      setShowAuth(false);
      setAuthForm({ username: "", email: "", password: "" });
      setMessage(
        authMode === "register" ? "Account created!" : "Welcome back!",
      );
      await loadUserData();
      await loadUserProfile();
    } catch (err) {
      const first = err.response?.data
        ? Object.values(err.response.data).flat()[0]
        : null;
      setMessage(typeof first === "string" ? first : "Auth failed");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setLoggedIn(false);
    setFavorites([]);
    setPlaylists([]);
    setPlaylistSongs([]);
    setSelectedPlaylist(null);
    setUserProfile({ id: null, username: "", email: "", first_name: "", last_name: "", date_joined: "" });
    setCurrentView("home");
    setMessage("Logged out successfully.");
  }

  // Music Playback Handler
  function playSong(song) {
    if (!song?.audio_url) {
      setMessage("No audio file for this song.");
      return;
    }
    if (currentSong?.id === song.id) {
      if (playing) audioRef.current?.pause();
      else audioRef.current?.play().catch(() => {});
      return;
    }
    setCurrentSong(song);
    setPlaying(true);
  }

  // Playlist & Favorite Handlers
  async function createPlaylist(e) {
    e.preventDefault();
    try {
      await api.post("/playlists/", { name: playlistName.trim() });
      setPlaylistName("");
      setShowPlaylistForm(false);
      await loadUserData();
      setMessage("Playlist created!");
    } catch {
      setMessage("Could not create playlist.");
    }
  }

  async function openPlaylist(pl) {
    try {
      const res = await api.get(`/playlists/${pl.id}/`);
      setSelectedPlaylist(res.data);
      setPlaylistSongs(res.data.songs || []);
      setCurrentView("playlist");
    } catch {
      setMessage("Could not load playlist");
    }
  }

  async function removeSongFromPlaylist(pid, sid) {
    try {
      await api.delete(`/playlists/${pid}/remove_song/?song_id=${sid}`);
      setPlaylistSongs((p) => p.filter((s) => s.id !== sid));
      setSelectedPlaylist((p) =>
        p ? { ...p, songs: p.songs.filter((s) => s.id !== sid) } : p,
      );
      await loadUserData();
    } catch {
      setMessage("Could not remove song");
    }
  }

  async function toggleFavorite(song) {
    try {
      if (favorites.includes(song.id)) {
        await api.delete(`/songs/${song.id}/favorite/`);
        setFavorites((o) => o.filter((id) => id !== song.id));
      } else {
        await api.post(`/songs/${song.id}/favorite/`, {});
        setFavorites((o) => [...o, song.id]);
      }
    } catch {
      setMessage("Could not update favorites");
    }
  }

  // Spotify Embed Handler
  function handleLoadEmbed(customUrl) {
    const target = (customUrl || spotifyUrlInput).trim();
    if (!target) {
      setEmbedError("Please enter a Spotify song, album, or playlist link.");
      return;
    }
    const parsed = parseSpotifyUrl(target);
    if (!parsed) {
      setEmbedError(
        "Invalid Spotify link! Example: https://open.spotify.com/track/... or /playlist/... (சரியான Spotify link உள்ளிடவும்)",
      );
      return;
    }
    setEmbedError("");
    setActiveEmbedUrl(parsed.embedUrl);
    setSpotifyUrlInput("");
    if (audioRef.current) audioRef.current.pause();
    setPlaying(false);
    setMessage(`Playing Spotify ${parsed.type}!`);
  }

  // Test Spotify Web API 403 response
  async function testSpotifyApiSearch() {
    setMessage("Testing Spotify Web API access...");
    try {
      const res = await api.get("/spotify/search/", {
        params: { q: query || "Tamil" },
      });
      setMessage(`Spotify API returned ${res.data.results?.length || 0} tracks.`);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.data?.is_spotify_403) {
        setCurrentView("spotify");
        setMessage(
          "Spotify Web API (403 Forbidden): Developer API search is restricted. Using Spotify Embed Player instead!",
        );
      } else {
        setMessage(err.response?.data?.error || "Spotify API request failed");
      }
    }
  }

  // Player Queue / Next / Prev logic
  const activeSongsList =
    currentView === "favorites"
      ? songs.filter((s) => favorites.includes(s.id))
      : currentView === "playlist"
        ? playlistSongs
        : currentView === "search" && searchResults.songs.length > 0
          ? searchResults.songs
          : songs;

  function playNext(dir) {
    if (!activeSongsList.length) return;
    const idx = activeSongsList.findIndex((s) => s.id === currentSong?.id);
    if (shuffleOn && dir === 1 && activeSongsList.length > 1) {
      const choices = activeSongsList.filter((s) => s.id !== currentSong?.id);
      playSong(choices[Math.floor(Math.random() * choices.length)]);
      return;
    }
    if (idx === -1) {
      playSong(activeSongsList[0]);
      return;
    }
    let next = idx + dir;
    if (next < 0) {
      if (repeatMode === "all") playSong(activeSongsList[activeSongsList.length - 1]);
      return;
    }
    if (next >= activeSongsList.length) {
      if (repeatMode === "all") playSong(activeSongsList[0]);
      else {
        setPlaying(false);
        setCurrentTime(0);
      }
      return;
    }
    playSong(activeSongsList[next]);
  }

  function formatTime(s) {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  // User display name helper
  const userDisplayName =
    userProfile.first_name || userProfile.last_name
      ? `${userProfile.first_name} ${userProfile.last_name}`.trim()
      : userProfile.username || "User";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Header */}
      <header className="flex h-[68px] items-center gap-4 px-5 border-b border-white/5">
        <div
          onClick={() => {
            setCurrentView("home");
            setSelectedPlaylist(null);
            setQuery("");
            loadSongs();
          }}
          className="flex items-center gap-2 text-xl font-black cursor-pointer"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1ed760] text-black shadow-lg shadow-[#1ed760]/20">
            <Headphones size={22} />
          </span>
          <span className="tracking-tight">SpotWave</span>
        </div>

        {/* Home & Search View Icons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => {
              setCurrentView("home");
              setSelectedPlaylist(null);
              setQuery("");
              loadSongs();
            }}
            title="Home"
            className={`rounded-full p-2.5 transition ${
              currentView === "home"
                ? "bg-[#1ed760] text-black"
                : "bg-[#242424] text-white hover:bg-[#333]"
            }`}
          >
            <Home size={19} />
          </button>

          <button
            onClick={() => {
              setCurrentView("search");
              if (query) executeSearch(query);
            }}
            title="Search"
            className={`rounded-full p-2.5 transition ${
              currentView === "search"
                ? "bg-[#1ed760] text-black"
                : "bg-[#242424] text-white hover:bg-[#333]"
            }`}
          >
            <Search size={19} />
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="flex max-w-xl flex-1 items-center gap-3 rounded-full bg-[#242424] px-4 py-2.5 focus-within:ring-2 focus-within:ring-[#1ed760]">
          <Search size={18} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            onFocus={() => {
              if (currentView !== "search") setCurrentView("search");
            }}
            placeholder="Search songs, artists, albums, or paste Spotify link..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
          />
        </div>

        {/* Spotify Embed Quick Access */}
        <button
          onClick={() => setCurrentView("spotify")}
          className={`hidden sm:flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
            currentView === "spotify"
              ? "bg-[#1ed760] text-black"
              : "bg-[#242424] text-gray-200 hover:bg-[#333]"
          }`}
        >
          <Radio size={15} />
          <span>Spotify Embed</span>
        </button>

        {/* User Account / Profile Button */}
        {loggedIn ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCurrentView("profile");
                loadUserProfile();
              }}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                currentView === "profile"
                  ? "bg-white text-black"
                  : "bg-[#242424] text-gray-200 hover:bg-[#333]"
              }`}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1ed760] text-xs font-black text-black">
                {userDisplayName.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[100px] truncate">{userDisplayName}</span>
            </button>
            <button
              onClick={handleLogout}
              title="Logout"
              className="rounded-full bg-[#242424] p-2 text-gray-400 hover:text-red-400 transition"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setAuthMode("login");
              setShowAuth(true);
            }}
            className="rounded-full bg-white px-5 py-2 text-xs font-bold text-black hover:bg-gray-200 transition"
          >
            Login
          </button>
        )}
      </header>

      {/* Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#181818] p-7 border border-white/10 shadow-2xl">
            <button
              onClick={() => setShowAuth(false)}
              className="float-right text-2xl text-gray-400 hover:text-white"
            >
              ×
            </button>
            <h2 className="text-2xl font-black text-center">
              {authMode === "login" ? "Welcome back!" : "Create account"}
            </h2>
            <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
              <input
                value={authForm.username}
                onChange={(e) =>
                  setAuthForm({ ...authForm, username: e.target.value })
                }
                placeholder="Username"
                className="w-full rounded-lg bg-[#242424] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#1ed760]"
                required
              />
              {authMode === "register" && (
                <input
                  value={authForm.email}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, email: e.target.value })
                  }
                  placeholder="Email"
                  type="email"
                  className="w-full rounded-lg bg-[#242424] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#1ed760]"
                  required
                />
              )}
              <input
                type="password"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({ ...authForm, password: e.target.value })
                }
                placeholder="Password"
                className="w-full rounded-lg bg-[#242424] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#1ed760]"
                required
              />
              <button
                disabled={authLoading}
                className="w-full rounded-full bg-[#1ed760] py-3 text-sm font-bold text-black transition hover:brightness-105"
              >
                {authLoading
                  ? "Wait..."
                  : authMode === "login"
                    ? "Log In"
                    : "Create Account"}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-400">
              {authMode === "login"
                ? "Don't have an account? "
                : "Already have an account? "}
              <button
                onClick={() =>
                  setAuthMode(authMode === "login" ? "register" : "login")
                }
                className="text-[#1ed760] font-bold hover:underline"
              >
                {authMode === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Main Grid Layout: Sidebar + Dynamic Content */}
      <main className="grid gap-3 px-3 pt-3 pb-28 md:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left Sidebar */}
        <aside className="hidden rounded-xl bg-[#121212] p-5 md:block border border-white/5">
          <div className="flex items-center gap-3 text-gray-300 mb-6">
            <Library size={22} className="text-[#1ed760]" />
            <span className="font-bold tracking-tight">Your Library</span>
          </div>

          <div className="space-y-1.5">
            <button
              onClick={() => {
                setCurrentView("home");
                loadSongs();
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                currentView === "home"
                  ? "bg-white/10 text-white font-bold"
                  : "text-gray-300 hover:bg-white/5"
              }`}
            >
              🎵 All Songs
            </button>

            <button
              onClick={() => {
                setCurrentView("search");
                if (query) executeSearch(query);
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                currentView === "search"
                  ? "bg-white/10 text-white font-bold"
                  : "text-gray-300 hover:bg-white/5"
              }`}
            >
              🔍 Search Music
            </button>

            <button
              onClick={() => setCurrentView("favorites")}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                currentView === "favorites"
                  ? "bg-white/10 text-white font-bold"
                  : "text-gray-300 hover:bg-white/5"
              }`}
            >
              ❤️ Favorite Songs ({favorites.length})
            </button>

            <button
              onClick={() => setCurrentView("spotify")}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                currentView === "spotify"
                  ? "bg-[#1ed760]/10 text-[#1ed760] font-bold border border-[#1ed760]/30"
                  : "text-gray-300 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <Radio size={16} className="text-[#1ed760]" />
                <span>Spotify Embed Player</span>
              </div>
            </button>

            {loggedIn && (
              <button
                onClick={() => {
                  setCurrentView("profile");
                  loadUserProfile();
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  currentView === "profile"
                    ? "bg-white/10 text-white font-bold"
                    : "text-gray-300 hover:bg-white/5"
                }`}
              >
                👤 My Profile
              </button>
            )}
          </div>

          {/* Playlist Creation Section */}
          <div className="mt-5 rounded-lg bg-[#1a1a1a] p-4 border border-white/5">
            <p className="font-bold text-xs text-gray-300 uppercase tracking-wider">
              Create Playlist
            </p>
            <button
              onClick={() => setShowPlaylistForm(!showPlaylistForm)}
              className="mt-3 flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-black hover:bg-gray-200 transition"
            >
              <Plus size={15} /> Create
            </button>
            {showPlaylistForm && (
              <form onSubmit={createPlaylist} className="mt-3 flex gap-2">
                <input
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  placeholder="Playlist name"
                  className="w-full rounded bg-[#2a2a2a] p-2 text-xs text-white outline-none focus:ring-1 focus:ring-[#1ed760]"
                  required
                />
                <button className="rounded bg-[#1ed760] px-3 text-xs font-bold text-black">
                  Save
                </button>
              </form>
            )}
          </div>

          {/* Playlist List */}
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Your Playlists
            </h3>
            {playlists.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No playlists yet</p>
            ) : (
              playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => openPlaylist(pl)}
                  className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition ${
                    currentView === "playlist" && selectedPlaylist?.id === pl.id
                      ? "bg-white/10 text-white font-semibold"
                      : "text-gray-300 hover:bg-white/5"
                  }`}
                >
                  🎵 {pl.name}{" "}
                  <span className="text-xs text-gray-500">
                    ({pl.songs?.length || 0})
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 space-y-2">
            <button
              onClick={loadUserData}
              className="block w-full text-left text-xs text-[#1ed760] hover:underline"
            >
              ↻ Refresh Library
            </button>
            <button
              onClick={testSpotifyApiSearch}
              className="block w-full text-left text-xs text-gray-400 hover:text-white"
            >
              ⚡ Test Spotify 403 API
            </button>
          </div>
        </aside>

        {/* Center / Right Content View */}
        <section className="min-h-[78vh] rounded-xl bg-gradient-to-b from-[#1c1c1c] to-[#101010] p-6 border border-white/5">
          {/* Notification Toast */}
          {message && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-[#252525] px-4 py-3 text-xs text-gray-200 border border-white/10">
              <span>{message}</span>
              <button
                onClick={() => setMessage("")}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* 1. USER PROFILE PAGE VIEW */}
          {/* ========================================================= */}
          {currentView === "profile" && (
            <div className="space-y-6">
              <button
                onClick={() => setCurrentView("home")}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
              >
                <ArrowLeft size={16} /> Back to Music
              </button>

              {/* Profile Hero Header */}
              <div className="rounded-2xl bg-gradient-to-r from-emerald-800 via-teal-900 to-[#181818] p-8 border border-white/10 shadow-2xl flex flex-col sm:flex-row items-center gap-6">
                <div className="relative">
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-[#1ed760] text-4xl font-black text-black shadow-2xl ring-4 ring-white/10">
                    {userDisplayName.charAt(0).toUpperCase()}
                  </div>
                </div>

                <div className="space-y-1 text-center sm:text-left">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                    User Profile
                  </span>
                  <h1 className="text-3xl font-black tracking-tight">
                    {userDisplayName}
                  </h1>
                  <p className="text-sm text-gray-300">{userProfile.email || "No email added"}</p>
                  <p className="text-xs text-gray-400">
                    @{userProfile.username} • Member since{" "}
                    {userProfile.date_joined
                      ? new Date(userProfile.date_joined).toLocaleDateString()
                      : "Recently"}
                  </p>
                </div>

                <div className="sm:ml-auto flex sm:flex-col gap-3">
                  <div className="rounded-xl bg-black/40 px-4 py-2 border border-white/5 text-center">
                    <p className="text-lg font-black text-[#1ed760]">{playlists.length}</p>
                    <p className="text-[11px] text-gray-400">Playlists</p>
                  </div>
                  <div className="rounded-xl bg-black/40 px-4 py-2 border border-white/5 text-center">
                    <p className="text-lg font-black text-[#1ed760]">{favorites.length}</p>
                    <p className="text-[11px] text-gray-400">Favorites</p>
                  </div>
                </div>
              </div>

              {/* Edit Profile Form */}
              <div className="rounded-xl bg-[#161616] p-6 border border-white/10 space-y-5">
                <div className="border-b border-white/5 pb-3">
                  <h3 className="text-lg font-bold">Edit Profile Details (சுயவிவரத்தை மாற்றுக)</h3>
                  <p className="text-xs text-gray-400">
                    Users can safely update their first name, last name, and email. Username is protected.
                  </p>
                </div>

                {profileMessage && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300 flex items-center gap-2">
                    <Check size={16} /> {profileMessage}
                  </div>
                )}

                {profileError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
                    ⚠️ {profileError}
                  </div>
                )}

                <form onSubmit={handleProfileUpdate} className="space-y-4 max-w-xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1">
                        First Name
                      </label>
                      <input
                        value={profileForm.first_name}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, first_name: e.target.value })
                        }
                        placeholder="Your first name"
                        className="w-full rounded-lg bg-[#242424] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1ed760]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1">
                        Last Name
                      </label>
                      <input
                        value={profileForm.last_name}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, last_name: e.target.value })
                        }
                        placeholder="Your last name"
                        className="w-full rounded-lg bg-[#242424] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1ed760]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, email: e.target.value })
                      }
                      placeholder="name@example.com"
                      className="w-full rounded-lg bg-[#242424] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1ed760]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">
                      Username (Read-only / பாதுகாப்பு கருதி மாற்ற முடியாது)
                    </label>
                    <input
                      value={userProfile.username}
                      disabled
                      className="w-full rounded-lg bg-[#1a1a1a] px-4 py-2.5 text-sm text-gray-400 border border-white/5 cursor-not-allowed"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="flex items-center gap-2 rounded-full bg-[#1ed760] px-6 py-2.5 text-sm font-bold text-black hover:brightness-105 transition"
                    >
                      <Save size={16} />
                      {profileSaving ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 rounded-full bg-red-500/10 border border-red-500/30 px-5 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition"
                    >
                      <LogOut size={16} />
                      Log Out
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. DEDICATED SEARCH PAGE VIEW */}
          {/* ========================================================= */}
          {currentView === "search" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-2xl font-black">Search (தேடல்)</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Explore songs, artists, albums, and playlists across your clone
                  </p>
                </div>
                <button
                  onClick={() => setCurrentView("spotify")}
                  className="flex items-center gap-2 rounded-full bg-[#242424] px-4 py-2 text-xs font-bold text-[#1ed760] hover:bg-[#333] transition"
                >
                  <Radio size={14} /> Spotify Embed Search
                </button>
              </div>

              {/* Category Filter Chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "All Results" },
                  { id: "songs", label: `Songs (${searchResults.songs.length})` },
                  { id: "artists", label: `Artists (${searchResults.artists.length})` },
                  { id: "albums", label: `Albums (${searchResults.albums.length})` },
                  { id: "playlists", label: `Playlists (${searchResults.playlists.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSearchCategory(tab.id)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                      searchCategory === tab.id
                        ? "bg-white text-black"
                        : "bg-[#252525] text-gray-300 hover:bg-[#333]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Loading State */}
              {searchLoading && (
                <div className="py-16 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#1ed760] border-t-transparent"></div>
                  <p className="mt-4 text-xs text-gray-400 animate-pulse">
                    Searching songs, artists, albums, and playlists...
                  </p>
                </div>
              )}

              {/* Error Message */}
              {searchError && !searchLoading && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  ⚠️ {searchError}
                </div>
              )}

              {/* Empty Query State: Browse Cards */}
              {!query.trim() && !searchLoading && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-300">Browse All / பிரபலமான தலைப்புகள்</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {SEARCH_BROWSE_CARDS.map((card) => (
                      <div
                        key={card.title}
                        onClick={() => {
                          setQuery(card.query);
                          executeSearch(card.query);
                        }}
                        className={`cursor-pointer rounded-xl bg-gradient-to-br ${card.color} p-5 aspect-video flex flex-col justify-between hover:scale-[1.02] transition shadow-lg`}
                      >
                        <h4 className="font-black text-lg">{card.title}</h4>
                        <span className="text-[11px] text-white/70">Click to search</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Results Display */}
              {query.trim() && !searchLoading && (
                <div className="space-y-6">
                  {/* Empty Results State */}
                  {searchResults.total_count === 0 && searchResults.artists.length === 0 ? (
                    <div className="rounded-xl border border-white/10 p-12 text-center bg-[#141414]">
                      <Search size={44} className="mx-auto text-gray-500" />
                      <p className="mt-4 text-sm font-semibold text-gray-200">
                        No results found for "{query}"
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Please check spelling or try pasting a Spotify link to stream via Spotify Embed!
                      </p>
                      <button
                        onClick={() => setCurrentView("spotify")}
                        className="mt-4 rounded-full bg-[#1ed760] px-5 py-2 text-xs font-bold text-black"
                      >
                        Try Spotify Embed Player
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Artists Row */}
                      {(searchCategory === "all" || searchCategory === "artists") &&
                        searchResults.artists.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Mic size={14} className="text-[#1ed760]" /> Artists
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {searchResults.artists.map((art) => (
                                <button
                                  key={art}
                                  onClick={() => {
                                    setQuery(art);
                                    executeSearch(art);
                                  }}
                                  className="rounded-full bg-[#252525] hover:bg-[#333] border border-white/10 px-4 py-1.5 text-xs font-semibold text-gray-200 transition"
                                >
                                  🎤 {art}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Albums Row */}
                      {(searchCategory === "all" || searchCategory === "albums") &&
                        searchResults.albums.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Disc size={14} className="text-[#1ed760]" /> Albums
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {searchResults.albums.map((alb) => (
                                <button
                                  key={alb}
                                  onClick={() => {
                                    setQuery(alb);
                                    executeSearch(alb);
                                  }}
                                  className="rounded-full bg-[#252525] hover:bg-[#333] border border-white/10 px-4 py-1.5 text-xs font-semibold text-gray-200 transition"
                                >
                                  💿 {alb}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Playlists Row */}
                      {(searchCategory === "all" || searchCategory === "playlists") &&
                        searchResults.playlists.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                              Matching Playlists
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {searchResults.playlists.map((pl) => (
                                <div
                                  key={pl.id}
                                  onClick={() => openPlaylist(pl)}
                                  className="cursor-pointer rounded-lg bg-[#202020] p-3 hover:bg-[#2c2c2c] transition"
                                >
                                  <p className="font-bold text-sm truncate">🎵 {pl.name}</p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {pl.songs?.length || 0} songs
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Songs Grid */}
                      {(searchCategory === "all" || searchCategory === "songs") &&
                        searchResults.songs.length > 0 && (
                          <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                              Matching Songs ({searchResults.songs.length})
                            </h3>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                              {searchResults.songs.map((song) => (
                                <article
                                  key={song.id}
                                  className="group rounded-xl bg-[#181818] p-3 transition hover:bg-[#252525] border border-transparent hover:border-white/5"
                                >
                                  <button
                                    onClick={() => playSong(song)}
                                    className="relative block aspect-square w-full overflow-hidden rounded-lg bg-[#282828]"
                                  >
                                    {song.cover_url ? (
                                      <img
                                        src={song.cover_url}
                                        alt={song.title}
                                        className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                                      />
                                    ) : (
                                      <div className="grid h-full place-items-center">
                                        <Music2 size={44} className="text-[#1ed760]" />
                                      </div>
                                    )}
                                    <span className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full bg-[#1ed760] text-black opacity-0 shadow-lg group-hover:opacity-100 transition transform translate-y-2 group-hover:translate-y-0">
                                      <Play size={18} fill="currentColor" />
                                    </span>
                                  </button>
                                  <div className="mt-3">
                                    <h3 className="truncate font-bold text-sm text-white">
                                      {song.title}
                                    </h3>
                                    <p className="truncate text-xs text-gray-400">{song.artist}</p>
                                    <div className="mt-3 flex items-center justify-between">
                                      <button
                                        onClick={() => toggleFavorite(song)}
                                        title="Add to Favorites"
                                      >
                                        <Heart
                                          size={16}
                                          fill={
                                            favorites.includes(song.id)
                                              ? "#1ed760"
                                              : "transparent"
                                          }
                                          className={
                                            favorites.includes(song.id)
                                              ? "text-[#1ed760]"
                                              : "text-gray-400 hover:text-white"
                                          }
                                        />
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 3. SPOTIFY EMBED PLAYER VIEW */}
          {/* ========================================================= */}
          {currentView === "spotify" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-2xl font-black">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1ed760] text-black">
                      <Radio size={18} />
                    </span>
                    <span>Spotify Embed Player</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Stream any Spotify track, album, or playlist legally and freely without 403 API restrictions.
                  </p>
                </div>

                <button
                  onClick={() => setCurrentView("home")}
                  className="rounded-full bg-[#2a2a2a] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#333] transition"
                >
                  ← Back to Local Library
                </button>
              </div>

              {/* Graceful 403 Information Banner */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 shrink-0 text-amber-400" size={20} />
                  <div>
                    <p className="font-bold text-amber-300">
                      Spotify Web API 403 Forbidden Access Notice (அறிவிப்பு):
                    </p>
                    <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
                      Spotify has restricted `/v1/search` in Development Mode for standard developer keys (returning 403 Forbidden).
                    </p>
                    <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
                      <strong>தீர்வு (Safe Solution):</strong> அதிகாரப்பூர்வ <strong>Spotify Embed Player</strong> மூலம் எந்த ஒரு Spotify URL-ஐயும் கீழே வழங்கி முழுமையாக இயக்கலாம்!
                    </p>
                  </div>
                </div>
              </div>

              {/* URL Input Form */}
              <div className="rounded-xl bg-[#161616] p-5 border border-white/10 space-y-4">
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                  Paste Spotify Track, Album, or Playlist URL:
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={spotifyUrlInput}
                    onChange={(e) => {
                      setSpotifyUrlInput(e.target.value);
                      if (embedError) setEmbedError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLoadEmbed();
                    }}
                    placeholder="e.g. https://open.spotify.com/playlist/37i9dQZF1DX4Wsb4d7NKfP"
                    className="flex-1 rounded-lg bg-[#242424] px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-[#1ed760]"
                  />
                  <button
                    onClick={() => handleLoadEmbed()}
                    className="rounded-lg bg-[#1ed760] px-6 py-3 text-sm font-bold text-black hover:brightness-105 transition"
                  >
                    Load Player
                  </button>
                  <button
                    onClick={() => {
                      setSpotifyUrlInput("");
                      setEmbedError("");
                    }}
                    className="rounded-lg bg-[#2a2a2a] px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-[#333] transition"
                  >
                    Clear
                  </button>
                </div>

                {embedError && (
                  <p className="text-xs text-red-400 font-medium">⚠️ {embedError}</p>
                )}

                {/* Preset Chips */}
                <div>
                  <p className="text-[11px] text-gray-400 font-semibold mb-2">
                    Quick Pick Popular Playlists (ஒரு கிளிக்கில் இயக்க):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SPOTIFY_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => handleLoadEmbed(preset.url)}
                        className="rounded-full border border-white/10 bg-[#202020] px-3.5 py-1.5 text-xs text-gray-300 hover:border-[#1ed760] hover:text-[#1ed760] transition"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Spotify Iframe Embed */}
              {activeEmbedUrl && (
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-2xl p-2">
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#1ed760] animate-pulse"></span>
                      Official Spotify Embed Player
                    </span>
                    <a
                      href={activeEmbedUrl.replace("/embed", "")}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[#1ed760] hover:underline"
                    >
                      Open in Spotify App <ExternalLink size={12} />
                    </a>
                  </div>
                  <iframe
                    style={{ borderRadius: "12px" }}
                    src={activeEmbedUrl}
                    width="100%"
                    height="352"
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    title="Spotify Web Player"
                    className="w-full"
                  />
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 4. HOME / FAVORITES / PLAYLIST VIEW (LOCAL SONGS) */}
          {/* ========================================================= */}
          {(currentView === "home" ||
            currentView === "favorites" ||
            currentView === "playlist") && (
            <div>
              <div className="mb-5 flex items-end justify-between border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-2xl font-black">
                    {currentView === "favorites"
                      ? "Your Favorite Songs"
                      : currentView === "playlist"
                        ? selectedPlaylist?.name || "Playlist"
                        : "All Songs (அனைத்துப் பாடல்கள்)"}
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Playing from Django Backend (Local & Streaming audio)
                  </p>
                </div>
                <span className="text-xs text-gray-400 font-medium">
                  {activeSongsList.length} tracks
                </span>
              </div>

              {activeSongsList.length === 0 ? (
                <div className="rounded-xl border border-white/10 p-12 text-center bg-[#141414]">
                  <Music2 size={46} className="mx-auto text-[#1ed760]" />
                  <p className="mt-4 text-sm font-semibold text-gray-300">
                    {currentView === "favorites"
                      ? "No favorite songs yet"
                      : currentView === "playlist"
                        ? "Empty playlist"
                        : "No songs found"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Upload MP3s via Django Admin or try the Spotify Embed Player!
                  </p>
                  <button
                    onClick={() => setCurrentView("spotify")}
                    className="mt-4 rounded-full bg-[#1ed760] px-5 py-2 text-xs font-bold text-black"
                  >
                    Open Spotify Embed Player
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {activeSongsList.map((song) => (
                    <article
                      key={song.id}
                      className="group rounded-xl bg-[#181818] p-3 transition hover:bg-[#252525] border border-transparent hover:border-white/5"
                    >
                      <button
                        onClick={() => playSong(song)}
                        className="relative block aspect-square w-full overflow-hidden rounded-lg bg-[#282828]"
                      >
                        {song.cover_url ? (
                          <img
                            src={song.cover_url}
                            alt={song.title}
                            className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : (
                          <div className="grid h-full place-items-center">
                            <Music2 size={44} className="text-[#1ed760]" />
                          </div>
                        )}
                        <span className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full bg-[#1ed760] text-black opacity-0 shadow-lg group-hover:opacity-100 transition transform translate-y-2 group-hover:translate-y-0">
                          <Play size={18} fill="currentColor" />
                        </span>
                      </button>
                      <div className="mt-3">
                        <h3 className="truncate font-bold text-sm text-white">
                          {song.title}
                        </h3>
                        <p className="truncate text-xs text-gray-400">{song.artist}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <button
                            onClick={() => toggleFavorite(song)}
                            title="Add to Favorites"
                          >
                            <Heart
                              size={16}
                              fill={
                                favorites.includes(song.id)
                                  ? "#1ed760"
                                  : "transparent"
                              }
                              className={
                                favorites.includes(song.id)
                                  ? "text-[#1ed760]"
                                  : "text-gray-400 hover:text-white"
                              }
                            />
                          </button>
                          {currentView === "playlist" && selectedPlaylist && (
                            <button
                              onClick={() =>
                                removeSongFromPlaylist(
                                  selectedPlaylist.id,
                                  song.id,
                                )
                              }
                              className="text-[11px] text-red-400 hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Sticky Bottom Audio Player Bar */}
      <footer className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-white/10 bg-[#111] px-4 py-3 backdrop-blur-md">
        {/* Left: Current Track Details */}
        <div className="flex items-center gap-3 min-w-0">
          {currentSong?.cover_url ? (
            <img
              src={currentSong.cover_url}
              alt=""
              className="h-12 w-12 rounded object-cover shadow"
            />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded bg-[#252525]">
              <Music2 size={22} className="text-[#1ed760]" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {currentSong?.title ||
                (currentView === "spotify" ? "Spotify Embed Mode" : "Choose a song")}
            </p>
            <p className="truncate text-xs text-gray-400">
              {currentSong?.artist ||
                (currentView === "spotify"
                  ? "Control audio in the iframe player above"
                  : "Local Player")}
            </p>
          </div>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShuffleOn((v) => !v)}
              className={shuffleOn ? "text-[#1ed760]" : "text-gray-400 hover:text-white"}
              title="Shuffle"
            >
              <Shuffle size={16} />
            </button>
            <button
              onClick={() => playNext(-1)}
              className="text-white hover:text-gray-300"
              title="Previous"
            >
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button
              onClick={() => currentSong && playSong(currentSong)}
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-black hover:scale-105 transition"
              title={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
            <button
              onClick={() => playNext(1)}
              className="text-white hover:text-gray-300"
              title="Next"
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
            <button
              onClick={() =>
                setRepeatMode((m) =>
                  m === "off" ? "all" : m === "all" ? "one" : "off",
                )
              }
              className={
                repeatMode !== "off"
                  ? "text-[#1ed760]"
                  : "text-gray-400 hover:text-white"
              }
              title={`Repeat: ${repeatMode}`}
            >
              <Repeat size={16} />
            </button>
          </div>

          <div className="flex w-full max-w-[420px] items-center gap-2 text-[10px] text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={Math.min(currentTime, duration || 1)}
              disabled={!currentSong}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (audioRef.current) {
                  audioRef.current.currentTime = t;
                  setCurrentTime(t);
                }
              }}
              className="h-1 flex-1 accent-[#1ed760] cursor-pointer"
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume Control */}
        <div className="hidden sm:flex items-center justify-end gap-2 text-gray-400">
          <Volume2 size={18} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-24 accent-[#1ed760] cursor-pointer"
          />
        </div>

        {/* Audio Element */}
        <audio
          ref={audioRef}
          src={currentSong?.audio_url || undefined}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            if (repeatMode === "one") {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play();
              }
            } else {
              playNext(1);
            }
          }}
        />
      </footer>
    </div>
  );
}

export default App;
