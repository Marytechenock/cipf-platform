import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventPhotoAlbums, isGoogleDriveFolderUrl } from './eventPhotoAlbums';

test('event albums preserve every configured name, ID and order without adding placeholder days', () => {
  const albums = getEventPhotoAlbums([
    { id: 'monday', day: 'Monday', driveLink: 'https://drive.google.com/drive/folders/three' },
    { id: 'old', day: 'Day 1', driveLink: 'https://drive.google.com/drive/folders/old' },
    { id: 'day5', day: 'Day 5', driveLink: 'https://drive.google.com/drive/folders/other' },
    { id: 'new', day: ' Tuesday ', driveLink: 'https://drive.google.com/drive/folders/one' }
  ]);
  assert.deepEqual(albums.map(album => album.day), ['Monday', 'Day 1', 'Day 5', 'Tuesday']);
  assert.deepEqual(albums.map(album => album.id), ['monday', 'old', 'day5', 'new']);
  assert.equal(albums[3].driveLink, 'https://drive.google.com/drive/folders/one');
  assert.deepEqual(getEventPhotoAlbums([]), []);
});

test('photo albums reject executable and external links while accepting Google Drive folder formats', () => {
  for (const link of ['javascript:alert(1)', 'http://drive.google.com/drive/folders/x', 'https://drive.google.com.evil.test/drive/folders/x', 'https://example.com', 'https://user@drive.google.com/drive/folders/x', 'https://drive.google.com/file/d/x/view']) {
    assert.equal(isGoogleDriveFolderUrl(link), false, link);
    assert.deepEqual(getEventPhotoAlbums([{ id: 'bad', day: 'Day 1', driveLink: link }]), []);
  }
  for (const link of ['https://drive.google.com/drive/folders/abc?usp=sharing', 'https://drive.google.com/drive/u/0/folders/abc', 'https://drive.google.com/open?id=abc']) {
    assert.equal(isGoogleDriveFolderUrl(link), true, link);
  }
});
