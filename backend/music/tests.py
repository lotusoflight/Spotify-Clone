from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Song, Playlist, Favorite

User = get_user_model()


class SpotifyCloneApiTests(APITestCase):
    def setUp(self):
        # Create test users
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="TestPassword123!",
            first_name="Test",
            last_name="User",
        )
        self.other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="OtherPassword123!",
        )

        # Create test songs
        self.song1 = Song.objects.create(
            title="Leo Badass",
            artist="Anirudh",
            album="Leo",
            genre="Action",
            duration=210,
            audio_url="https://example.com/audio/badass.mp3",
        )
        self.song2 = Song.objects.create(
            title="Vande Mataram",
            artist="A.R. Rahman",
            album="Vande Mataram",
            genre="Patriotic",
            duration=300,
            audio_url="https://example.com/audio/vande.mp3",
        )

        # Create test playlist
        self.playlist = Playlist.objects.create(
            user=self.user,
            name="My Tamil Favorites",
        )

    # 1. Registration Test
    def test_user_registration(self):
        url = reverse("music:register")
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePassword123!",
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="newuser").exists())

    # 2. JWT Login Test
    def test_user_login(self):
        url = reverse("music:token_obtain_pair")
        data = {
            "username": "testuser",
            "password": "TestPassword123!",
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    # 3. User Profile: View & Safe Edit Test
    def test_user_profile_authenticated(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("music:user_profile")

        # GET Profile
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "testuser")
        self.assertEqual(response.data["email"], "test@example.com")
        self.assertEqual(response.data["first_name"], "Test")

        # PATCH Profile
        patch_data = {
            "first_name": "Gopi",
            "last_name": "Kumar",
            "email": "updated@example.com",
            "username": "hacked_username",  # Should be ignored (read-only)
        }
        patch_response = self.client.patch(url, patch_data)
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["first_name"], "Gopi")
        self.assertEqual(patch_response.data["last_name"], "Kumar")
        self.assertEqual(patch_response.data["email"], "updated@example.com")
        # Ensure username was NOT altered
        self.assertEqual(patch_response.data["username"], "testuser")

    # 4. User Profile: Unauthenticated Access Denied
    def test_user_profile_unauthenticated_denied(self):
        url = reverse("music:user_profile")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 5. Songs List & Search Test
    def test_songs_listing_and_filtering(self):
        url = reverse("music:song-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

        # Search by artist
        search_res = self.client.get(url, {"q": "Anirudh"})
        self.assertEqual(len(search_res.data), 1)
        self.assertEqual(search_res.data[0]["title"], "Leo Badass")

    # 6. Song Serializer Audio URL Fallback Test
    def test_song_serializer_audio_url_fallback(self):
        url = reverse("music:song-detail", kwargs={"pk": self.song1.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should correctly return audio_url when audio_file is empty
        self.assertEqual(
            response.data["audio_url"],
            "https://example.com/audio/badass.mp3",
        )

    # 7. Playlist User Isolation Test
    def test_playlist_user_isolation(self):
        self.client.force_authenticate(user=self.other_user)
        url = reverse("music:playlist-list")
        response = self.client.get(url)
        # other_user should see 0 playlists (not self.user's playlists)
        self.assertEqual(len(response.data), 0)

        # other_user cannot access self.user's playlist directly
        detail_url = reverse(
            "music:playlist-detail", kwargs={"pk": self.playlist.pk}
        )
        detail_res = self.client.get(detail_url)
        self.assertEqual(detail_res.status_code, status.HTTP_404_NOT_FOUND)

    # 8. Unified Search Test (Songs, Artists, Albums, Playlists)
    def test_unified_search(self):
        url = reverse("music:unified_search")
        response = self.client.get(url, {"q": "Leo"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("songs", response.data)
        self.assertIn("artists", response.data)
        self.assertIn("albums", response.data)
        self.assertEqual(len(response.data["songs"]), 1)
        self.assertEqual(response.data["songs"][0]["title"], "Leo Badass")
        self.assertIn("Leo", response.data["albums"])

    # 9. Spotify Embed URL Validation Test
    def test_spotify_validate_embed(self):
        url = reverse("music:spotify_validate_embed")

        # Valid track URL
        valid_track = "https://open.spotify.com/track/1wIfq9Zul77qAtokyLTlXr"
        res = self.client.post(url, {"url": valid_track})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["valid"])
        self.assertEqual(res.data["type"], "track")
        self.assertIn("embed", res.data["embed_url"])

        # Valid playlist URL with intl prefix
        valid_playlist = (
            "https://open.spotify.com/intl-en/playlist/37i9dQZF1DX4Wsb4d7NKfP"
        )
        res_pl = self.client.post(url, {"url": valid_playlist})
        self.assertEqual(res_pl.status_code, status.HTTP_200_OK)
        self.assertTrue(res_pl.data["valid"])
        self.assertEqual(res_pl.data["type"], "playlist")

        # Invalid URL
        invalid_url = "https://youtube.com/watch?v=12345"
        res_inv = self.client.post(url, {"url": invalid_url})
        self.assertEqual(res_inv.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res_inv.data["valid"])

    # 10. Favorite Toggle Test
    def test_favorite_toggle(self):
        self.client.force_authenticate(user=self.user)
        fav_url = reverse(
            "music:song-favorite", kwargs={"pk": self.song1.pk}
        )

        # Add to favorites
        post_res = self.client.post(fav_url)
        self.assertEqual(post_res.status_code, status.HTTP_200_OK)
        self.assertTrue(
            Favorite.objects.filter(
                user=self.user, song=self.song1
            ).exists()
        )

        # Remove from favorites
        del_res = self.client.delete(fav_url)
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            Favorite.objects.filter(
                user=self.user, song=self.song1
            ).exists()
        )
