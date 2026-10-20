from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Song, Playlist, Favorite

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        min_length=8,
    )

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "date_joined",
        ]
        read_only_fields = ["id", "username", "date_joined"]

    def validate_email(self, value):
        user = self.instance
        if value and User.objects.exclude(pk=user.pk).filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already registered to another user.")
        return value


class SongSerializer(serializers.ModelSerializer):
    audio_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = [
            "id",
            "title",
            "artist",
            "album",
            "genre",
            "duration",
            "audio_url",
            "cover_url",
        ]

    def get_audio_url(self, obj):
        request = self.context.get("request")
        # Check uploaded file first
        if obj.audio_file:
            url = obj.audio_file.url
            return request.build_absolute_uri(url) if request else url
        # Fallback to direct mp3 / streaming URL
        if obj.audio_url:
            return obj.audio_url
        return None

    def get_cover_url(self, obj):
        request = self.context.get("request")
        if not obj.cover_image:
            return None
        url = obj.cover_image.url
        return request.build_absolute_uri(url) if request else url


class PlaylistSerializer(serializers.ModelSerializer):
    songs = SongSerializer(many=True, read_only=True)

    class Meta:
        model = Playlist
        fields = ["id", "name", "songs", "created_at"]
        read_only_fields = ["id", "songs", "created_at"]


class FavoriteSerializer(serializers.ModelSerializer):
    song = SongSerializer(read_only=True)

    class Meta:
        model = Favorite
        fields = ["id", "song", "created_at"]
