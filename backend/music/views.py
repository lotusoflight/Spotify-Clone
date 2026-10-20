import re
from urllib.parse import urlparse

import requests

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Q
from django.shortcuts import render

from rest_framework import generics, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Song, Playlist, PlaylistSong, Favorite
from .serializers import (
    RegisterSerializer,
    UserProfileSerializer,
    SongSerializer,
    PlaylistSerializer,
    FavoriteSerializer,
)


User = get_user_model()


# =====================================================
# USER REGISTRATION API
# =====================================================

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


# =====================================================
# USER PROFILE API (VIEW & UPDATE - PRIVATE TO LOGGED IN USER)
# =====================================================

class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Strict security: Users can ONLY access and edit their own private profile
        return self.request.user


# =====================================================
# SONGS API + FAVORITES
# =====================================================

class SongViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SongSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = Song.objects.all()

        query = self.request.query_params.get("q", "").strip()
        genre = self.request.query_params.get("genre", "").strip()

        if query:
            queryset = queryset.filter(
                Q(title__icontains=query)
                | Q(artist__icontains=query)
                | Q(album__icontains=query)
            )

        if genre:
            queryset = queryset.filter(genre__iexact=genre)

        return queryset

    # GET: Logged-in user's favorite songs
    @action(
        detail=False,
        methods=["get"],
        permission_classes=[IsAuthenticated],
    )
    def favorites(self, request):
        favorites = Favorite.objects.filter(
            user=request.user
        ).select_related("song")

        songs = [favorite.song for favorite in favorites]

        serializer = self.get_serializer(songs, many=True)
        return Response(serializer.data)

    # POST: Add favorite
    # DELETE: Remove favorite
    @action(
        detail=True,
        methods=["post", "delete"],
        permission_classes=[IsAuthenticated],
    )
    def favorite(self, request, pk=None):
        song = self.get_object()

        if request.method == "DELETE":
            deleted, _ = Favorite.objects.filter(
                user=request.user,
                song=song,
            ).delete()

            if not deleted:
                return Response(
                    {"error": "Song is not in your favorites."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return Response(status=status.HTTP_204_NO_CONTENT)

        _, created = Favorite.objects.get_or_create(
            user=request.user,
            song=song,
        )

        return Response(
            {"favorited": True, "created": created},
            status=status.HTTP_200_OK,
        )


# =====================================================
# USER PLAYLISTS API
# =====================================================

class PlaylistViewSet(viewsets.ModelViewSet):
    serializer_class = PlaylistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Users can access only their own playlists
        return Playlist.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    # POST: Add a song to the user's playlist
    @action(detail=True, methods=["post"])
    def add_song(self, request, pk=None):
        playlist = self.get_object()
        song_id = request.data.get("song_id")

        if not song_id:
            return Response(
                {"error": "song_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            song = Song.objects.get(pk=song_id)
        except (Song.DoesNotExist, ValueError, TypeError):
            return Response(
                {"error": "Song not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, created = PlaylistSong.objects.get_or_create(
            playlist=playlist,
            song=song,
        )

        return Response(
            {
                "message": (
                    "Song added."
                    if created
                    else "Song already in playlist."
                )
            },
            status=status.HTTP_200_OK,
        )

    # DELETE: Remove a song from the user's playlist
    @action(detail=True, methods=["delete"])
    def remove_song(self, request, pk=None):
        playlist = self.get_object()
        song_id = request.query_params.get("song_id")

        if not song_id:
            return Response(
                {"error": "song_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted, _ = PlaylistSong.objects.filter(
            playlist=playlist,
            song_id=song_id,
        ).delete()

        if not deleted:
            return Response(
                {"error": "Song not found in playlist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


# =====================================================
# UNIFIED SEARCH API (SONGS, ARTISTS, ALBUMS, PLAYLISTS)
# GET /api/search/?q=...
# =====================================================

@api_view(["GET"])
@permission_classes([AllowAny])
def unified_search(request):
    query = request.query_params.get("q", "").strip()

    if not query:
        return Response({
            "query": "",
            "songs": [],
            "artists": [],
            "albums": [],
            "playlists": [],
            "total_count": 0,
        })

    songs = Song.objects.filter(
        Q(title__icontains=query)
        | Q(artist__icontains=query)
        | Q(album__icontains=query)
        | Q(genre__icontains=query)
    )

    songs_data = SongSerializer(songs, many=True, context={"request": request}).data

    artists = []
    seen_artists = set()
    for s in songs:
        if s.artist and s.artist.strip().lower() not in seen_artists:
            seen_artists.add(s.artist.strip().lower())
            artists.append(s.artist)

    albums = []
    seen_albums = set()
    for s in songs:
        if s.album and s.album.strip().lower() not in seen_albums:
            seen_albums.add(s.album.strip().lower())
            albums.append(s.album)

    playlists_data = []
    if request.user.is_authenticated:
        user_playlists = Playlist.objects.filter(
            user=request.user,
            name__icontains=query,
        )
        playlists_data = PlaylistSerializer(
            user_playlists,
            many=True,
            context={"request": request},
        ).data

    return Response({
        "query": query,
        "songs": songs_data,
        "artists": artists,
        "albums": albums,
        "playlists": playlists_data,
        "total_count": len(songs_data) + len(playlists_data),
    })


# =====================================================
# SPOTIFY ACCESS TOKEN
# =====================================================

def get_spotify_token():
    client_id = getattr(settings, "SPOTIFY_CLIENT_ID", "")
    client_secret = getattr(settings, "SPOTIFY_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        raise ValueError(
            "Spotify credentials are missing. Check backend/.env."
        )

    cached_token = cache.get("spotify_access_token")

    if cached_token:
        return cached_token

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        timeout=15,
    )

    response.raise_for_status()

    data = response.json()
    token = data["access_token"]

    cache.set(
        "spotify_access_token",
        token,
        timeout=max(60, data.get("expires_in", 3600) - 60),
    )

    return token


# =====================================================
# SHARED SPOTIFY API ERROR HANDLER (GRACEFUL 403 HANDLING)
# =====================================================

def spotify_error_response(exc):
    response = getattr(exc, "response", None)
    code = response.status_code if response is not None else None

    if code == 401:
        cache.delete("spotify_access_token")
        message = (
            "Spotify authentication failed. Check credentials in backend/.env."
        )
    elif code == 403:
        message = (
            "Spotify API access is restricted (403 Forbidden). "
            "Spotify restricts Web API search for developer apps in Development Mode. "
            "Use the Spotify Embed Player below to play any track, album, or playlist directly!"
        )
    elif code == 429:
        message = (
            "Spotify rate limit reached. Please wait before trying again."
        )
    else:
        message = (
            "Spotify API request failed. Please check backend logs or use the Embed Player."
        )

    if response is not None:
        print("Spotify API status:", code)
        print("Spotify API response:", response.text[:1000])

    return Response(
        {
            "error": message,
            "status_code": code,
            "is_spotify_403": (code == 403),
            "embed_fallback": True,
            "hint": "Paste any open.spotify.com URL to stream via official Embed Player.",
        },
        status=(
            code
            if code in (401, 403, 429)
            else status.HTTP_502_BAD_GATEWAY
        ),
    )


# =====================================================
# SPOTIFY TRACK SEARCH API
# GET /api/spotify/search/?q=...
# =====================================================

@api_view(["GET"])
@permission_classes([AllowAny])
def spotify_search(request):
    query = request.query_params.get("q", "").strip()

    if not query:
        return Response(
            {"error": "Provide a search query, e.g. ?q=Tamil songs"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token = get_spotify_token()

        response = requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "q": query,
                "type": "track",
                "limit": 12,
                "market": "IN",
            },
            timeout=15,
        )

        response.raise_for_status()

        tracks = response.json().get("tracks", {}).get("items", [])

        results = []

        for track in tracks:
            album = track.get("album") or {}
            images = album.get("images") or []

            results.append({
                "id": track.get("id"),
                "name": track.get("name"),
                "artists": [
                    artist.get("name", "")
                    for artist in track.get("artists", [])
                ],
                "album": album.get("name"),
                "image": images[0].get("url") if images else None,
                "spotify_url": track.get(
                    "external_urls", {}
                ).get("spotify"),
            })

        return Response({"results": results})

    except requests.RequestException as exc:
        print("Spotify track search error:", repr(exc))
        return spotify_error_response(exc)

    except (ValueError, KeyError) as exc:
        print("Spotify track response error:", repr(exc))
        return Response(
            {"error": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )


# =====================================================
# SPOTIFY PLAYLIST SEARCH API
# GET /api/spotify/playlists/?q=Tamil Hits
# =====================================================

@api_view(["GET"])
@permission_classes([AllowAny])
def spotify_playlist_search(request):
    query = request.query_params.get("q", "").strip()

    if not query:
        return Response(
            {
                "error": (
                    "Provide a playlist search query, "
                    "e.g. ?q=Tamil Hits"
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token = get_spotify_token()

        response = requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "q": query,
                "type": "playlist",
                "limit": 10,
                "market": "IN",
            },
            timeout=15,
        )

        response.raise_for_status()

        data = response.json()
        playlist_data = data.get("playlists") or {}
        items = playlist_data.get("items") or []

        results = []

        for item in items:
            if not item:
                continue

            images = item.get("images") or []
            owner = item.get("owner") or {}
            external_urls = item.get("external_urls") or {}

            results.append({
                "id": item.get("id"),
                "name": item.get("name"),
                "description": item.get("description") or "",
                "image": images[0].get("url") if images else None,
                "spotify_url": external_urls.get("spotify"),
                "owner": owner.get("display_name", ""),
            })

        return Response({"results": results})

    except requests.RequestException as exc:
        print("Spotify playlist search error:", repr(exc))
        return spotify_error_response(exc)

    except (ValueError, KeyError) as exc:
        print("Spotify playlist response error:", repr(exc))
        return Response(
            {"error": "Could not process Spotify's response."},
            status=status.HTTP_502_BAD_GATEWAY,
        )


# =====================================================
# SPOTIFY EMBED VALIDATION API
# GET or POST /api/spotify/validate-embed/
# =====================================================

@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def spotify_validate_embed(request):
    url = (
        request.data.get("url")
        if request.method == "POST"
        else request.query_params.get("url", "")
    )
    url = (url or "").strip()

    if not url:
        return Response(
            {"valid": False, "error": "Spotify link-ஐ உள்ளிடவும் (Provide a Spotify URL)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    valid_types = {"track", "album", "playlist", "artist", "show", "episode"}

    # Handle URI format (e.g., spotify:track:4cOdK2wGLETKBW3PvgPWqT)
    if url.startswith("spotify:"):
        parts = url.split(":")
        if len(parts) >= 3 and parts[1] in valid_types and re.fullmatch(r"[A-Za-z0-9]+", parts[2]):
            return Response({
                "valid": True,
                "type": parts[1],
                "id": parts[2],
                "embed_url": f"https://open.spotify.com/embed/{parts[1]}/{parts[2]}?utm_source=generator",
            })

    # Handle HTTPS URL
    parsed = urlparse(url)
    allowed_hosts = {"open.spotify.com", "www.open.spotify.com"}

    if parsed.scheme == "https" and parsed.hostname in allowed_hosts:
        segments = [s for s in parsed.path.strip("/").split("/") if s]
        if segments and segments[0].startswith("intl-"):
            segments.pop(0)

        if len(segments) >= 2 and segments[0] in valid_types and re.fullmatch(r"[A-Za-z0-9]+", segments[1]):
            return Response({
                "valid": True,
                "type": segments[0],
                "id": segments[1],
                "embed_url": f"https://open.spotify.com/embed/{segments[0]}/{segments[1]}?utm_source=generator",
            })

    return Response(
        {
            "valid": False,
            "error": "Valid Spotify track, album, or playlist link-ஐ உள்ளிடவும் (Invalid Spotify URL).",
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


# =====================================================
# HOMEPAGE — SPOTIFY EMBED HTML VIEW
# =====================================================

def home(request):
    spotify_url = request.GET.get("url", "").strip()
    embed_url = ""
    error_message = ""

    demo_songs = [
        {
            "title": "Featured Track",
            "artist": "Open Spotify Player",
            "track_id": "1wIfq9Zul77qAtokyLTlXr",
            "color": "purple",
        },
    ]

    if spotify_url:
        parsed = urlparse(spotify_url)
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        if parts and parts[0].startswith("intl-"):
            parts.pop(0)

        valid_types = {
            "track",
            "album",
            "playlist",
            "artist",
            "show",
            "episode",
        }

        if (
            parsed.scheme == "https"
            and parsed.hostname in {
                "open.spotify.com",
                "www.open.spotify.com",
            }
            and len(parts) >= 2
            and parts[0] in valid_types
            and re.fullmatch(r"[A-Za-z0-9]+", parts[1])
        ):
            embed_url = (
                f"https://open.spotify.com/embed/"
                f"{parts[0]}/{parts[1]}?utm_source=generator"
            )
        else:
            error_message = "Valid Spotify link-ஐ உள்ளிடவும்."

    return render(
        request,
        "music/home.html",
        {
            "spotify_url": spotify_url,
            "embed_url": embed_url,
            "error_message": error_message,
            "demo_songs": demo_songs,
        },
    )


# =====================================================
# SPOTIFY EMBED HTML PAGE
# =====================================================

def spotify_embed(request):
    spotify_url = request.GET.get("url", "").strip()
    embed_url = ""
    error_message = ""

    if spotify_url:
        parsed = urlparse(spotify_url)
        allowed_hosts = {
            "open.spotify.com",
            "www.open.spotify.com",
        }
        valid_types = {
            "track",
            "album",
            "playlist",
            "artist",
            "show",
            "episode",
        }
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        if parts and parts[0].startswith("intl-"):
            parts.pop(0)

        if (
            parsed.scheme == "https"
            and parsed.hostname in allowed_hosts
            and len(parts) >= 2
            and parts[0] in valid_types
            and re.fullmatch(r"[A-Za-z0-9]+", parts[1])
        ):
            embed_url = (
                f"https://open.spotify.com/embed/"
                f"{parts[0]}/{parts[1]}?utm_source=generator"
            )
        else:
            error_message = (
                "Valid Spotify song, album, or playlist link-ஐ உள்ளிடவும்."
            )

    return render(
        request,
        "music/spotify_embed.html",
        {
            "embed_url": embed_url,
            "error_message": error_message,
            "spotify_url": spotify_url,
        },
    )
