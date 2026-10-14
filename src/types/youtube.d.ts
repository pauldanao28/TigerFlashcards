// Minimal types for the parts of the YouTube IFrame Player API the Watch view uses.
// https://developers.google.com/youtube/iframe_api_reference
declare namespace YT {
  interface Player {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }
  interface PlayerEvent { target: Player }
  interface OnStateChangeEvent { target: Player; data: number }
  interface OnErrorEvent { target: Player; data: number }
  interface PlayerOptions {
    videoId: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: PlayerEvent) => void;
      onStateChange?: (e: OnStateChangeEvent) => void;
      onError?: (e: OnErrorEvent) => void;
    };
  }
}

interface Window {
  YT?: { Player: new (el: HTMLElement, opts: YT.PlayerOptions) => YT.Player };
  onYouTubeIframeAPIReady?: () => void;
}
