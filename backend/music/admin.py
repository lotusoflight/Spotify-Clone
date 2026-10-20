from django.contrib import admin
from .models import Song, Playlist, PlaylistSong, Favorite
from .models import FreeSong

@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ("title", "artist", "album", "genre")
    search_fields = ("title", "artist", "album")
    list_filter = ("genre",)

@admin.register(FreeSong)
class FreeSongAdmin(admin.ModelAdmin):
    list_display = ("title", "artist", "license_name", "created_at")
    search_fields = ("title", "artist")

admin.site.register(Playlist)
admin.site.register(PlaylistSong)
admin.site.register(Favorite)