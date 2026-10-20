from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from . import views
from .views import RegisterView, SongViewSet, PlaylistViewSet, UserProfileView

app_name = "music"

router = DefaultRouter()
router.register("songs", SongViewSet, basename="song")
router.register("playlists", PlaylistViewSet, basename="playlist")

urlpatterns = [
    # Authentication & User Profile API endpoints
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/profile/", UserProfileView.as_view(), name="user_profile"),

    # Unified Search (Songs, Artists, Albums, Playlists)
    path("search/", views.unified_search, name="unified_search"),

    # Spotify API endpoints
    path("spotify/search/", views.spotify_search, name="spotify_search"),
    path("spotify/playlists/", views.spotify_playlist_search, name="spotify_playlist_search"),
    path("spotify/validate-embed/", views.spotify_validate_embed, name="spotify_validate_embed"),

    # Songs and Playlists ViewSets
    path("", include(router.urls)),
]
