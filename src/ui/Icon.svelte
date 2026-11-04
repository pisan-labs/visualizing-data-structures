<script lang="ts">
  const paths = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
    'step-forward': 'M5 5v14l9-7zM16 5h3v14h-3z',
    'step-back': 'M19 5v14l-9-7zM5 5h3v14H5z',
    'op-forward': 'M3 5v14l8-7zM12 5v14l8-7zM20 5h2v14h-2z',
    'op-back': 'M21 5v14l-8-7zM12 5v14l-8-7zM2 5h2v14H2z',
    plus: 'M11 5h2v14h-2zM5 11h14v2H5z',
    minus: 'M5 11h14v2H5z',
    fit: 'M4 4h6v2H6v4H4zM20 4v6h-2V6h-4V4zM4 20v-6h2v4h4v2zM20 20h-6v-2h4v-4h2z',
  } as const;

  let { name, size = 20 }: { name: keyof typeof paths; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d={paths[name]} fill="currentColor" />
</svg>
