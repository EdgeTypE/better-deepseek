/**
 * Sandbox script for safe PPTX generation.
 * Runs in a null-origin iframe with 'unsafe-eval' allowed.
 */

import PptxGenJS from "pptxgenjs";

console.log("BDS Sandbox: Initialized");

window.addEventListener("message", async (event) => {
  const { type, code, id } = event.data;

  if (type === "GEN_PPTX") {
    console.log("BDS Sandbox: Received generation request", id);
    try {
      // Intercept writeFile to capture the promise
      const originalWriteFile = PptxGenJS.prototype.writeFile;
      let generationPromise = null;
      
      PptxGenJS.prototype.writeFile = function(args) {
        console.log("BDS Sandbox: pptx.writeFile() intercepted");
        generationPromise = this.write({ outputType: 'base64' });
        return generationPromise;
      };

      // Execute the AI code
      const func = new Function("PptxGenJS", "pptxgen", code);
      await func(PptxGenJS, PptxGenJS);
      
      // Important: The AI code might not await the writeFile call.
      // We must check if it was called and await the resulting promise.
      if (generationPromise) {
        console.log("BDS Sandbox: Awaiting file generation...");
        const capturedBase64 = await generationPromise;
        window.parent.postMessage({ type: "PPTX_RESULT", base64: capturedBase64, id }, "*");
        console.log("BDS Sandbox: Success, sent result to parent");
      } else {
        throw new Error("No PPTX data was generated. Did the script call pptx.writeFile()?");
      }

      // Restore prototype just in case of reuse
      PptxGenJS.prototype.writeFile = originalWriteFile;

    } catch (err) {
      console.error("BDS Sandbox Error:", err);
      window.parent.postMessage({ type: "PPTX_ERROR", error: err.message, id }, "*");
    }
  }
});
