from django.conf import settings
from django.db import models

class Song(models.Model):
    title = models.CharField(max_length=200)
    artist = models.CharField(max_length=200)
    album = models.CharField(max_length=200, blank=True)
    cover_image = models.ImageField(
        upload_to="covers/",
        blank=True,
        null=True,
    )
    audio_file = models.FileField(upload_to='songs/', blank=True, null=True)
    audio_url = models.URLField(max_length=500, blank=True, null=True, help_text="Direct mp3 link podu da")
    duration = models.PositiveIntegerField(default=0)
    genre = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return f"{self.title} - {self.artist}"

class Playlist(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="playlists",
    )
    name = models.CharField(max_length=150)
    songs = models.ManyToManyField(
        Song,
        through="PlaylistSong",
        related_name="playlists",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.user}"

class PlaylistSong(models.Model):
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE)
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["playlist", "song"], name="unique_song_per_playlist")
        ]

class Favorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "song"], name="unique_favorite_per_user")
        ]
class FreeSong(models.Model):
    title = models.CharField(max_length=200)
    artist = models.CharField(max_length=200)
    audio_file = models.FileField(upload_to="songs/")
    cover_image = models.ImageField(
        upload_to="covers/",
        blank=True,
        null=True,
    )
    license_name = models.CharField(
        max_length=200,
        default="Check source license",
    )
    source_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} - {self.artist}"
    