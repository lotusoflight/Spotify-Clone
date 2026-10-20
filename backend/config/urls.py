"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from music import views as music_views

urlpatterns = [
    path("admin/", admin.site.urls),

    # REST API endpoints (Registered once under unique 'music' namespace)
    path("api/", include("music.urls")),

    # Root HTML Views
    path("", music_views.home, name="home"),
    path("spotify-embed/", music_views.spotify_embed, name="spotify_embed"),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
