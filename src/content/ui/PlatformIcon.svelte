<script>
  import { getPlatformBrand } from "../../lib/platform-brand.js";

  let { host = "", size = 20 } = $props();

  const brand = $derived(getPlatformBrand(host));
  const fontSize = $derived(Math.round(size * 0.55));
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 100 100"
  aria-label={brand.name}
  role="img"
  style="display: inline-block; vertical-align: middle; flex-shrink: 0;"
>
  <circle cx="50" cy="50" r="50" fill={brand.color} />
  <text
    x="50"
    y="52"
    text-anchor="middle"
    dominant-baseline="central"
    fill="white"
    font-size="55"
    font-weight="700"
    font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  >
    {brand.initial}
  </text>
</svg>
