// Observe the media promise, rather than the SDK's optimistic play status.
export async function playSharedMedia(media, active = () => true) {
  if (!active()) return 'cancelled';
  try {
    await media.play();
    return active() ? 'playing' : 'cancelled';
  } catch (error) {
    if (!active()) return 'cancelled';
    if (error?.name !== 'NotAllowedError') return 'waiting';
    const wasMuted = media.muted;
    media.muted = true;
    try {
      await media.play();
      return active() ? 'muted' : 'cancelled';
    } catch {
      if (active()) media.muted = wasMuted;
      return active() ? 'blocked' : 'cancelled';
    }
  }
}
