<script>
  import { triggerBlobDownload } from "../../lib/utils/download.js";

  /** @type {{ title: string, description: string, fileName: string, blob: Blob }} */
  let { title, description, fileName, blob } = $props();

  function handleDownload() {
    triggerBlobDownload(blob, fileName);
  }
</script>

<article class="bds-download-card">
  <h4>{title}</h4>
  <p>{description}</p>
  <button type="button" class="bds-btn" onclick={handleDownload}>
    Download {fileName}
  </button>
</article>

<style>
  .bds-download-card {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: transparent;
    padding: 12px;
    margin: 10px 0;
  }

  h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: inherit;
  }

  p {
    margin: 0 0 12px 0;
    font-size: 12px;
    color: inherit;
    /* DeepSeek uses #ececec for text in dark mode but inheriting is best */
    opacity: 0.8;
  }

  .bds-btn {
    background: #4A90E2;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .bds-btn:hover {
    background: #357ABD;
  }

  :global(.dark) .bds-download-card {
    border-color: #4b5563;
    color: #ececec;
  }
</style>
