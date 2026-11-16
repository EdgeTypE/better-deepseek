/**
 * Sandbox script for safe PPTX generation.
 * Runs in a null-origin iframe with 'unsafe-eval' allowed.
 */

import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";
import * as docx from "docx";

// Attach to window so AI can access them globally or via window.Library
window.PptxGenJS = PptxGenJS;
window.pptxgen = PptxGenJS; // Alias often used
window.XLSX = XLSX;
window.docx = docx;
window.DOCX = docx; // Common naming convention

// Expose all docx exports as globals for easier AI access
Object.keys(docx).forEach(key => {
  if (!(key in window)) {
    window[key] = docx[key];
  }
});

console.log("BDS Sandbox: Initialized");

// Helper for executing AI code which might contain 'await'
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

window.addEventListener("message", async (event) => {
  const { type, code, id } = event.data;

  if (type === "GEN_PPTX") {
    console.log("BDS Sandbox: Received PPTX generation request", id);
    try {
      // Intercept writeFile to capture the promise
      const originalWriteFile = PptxGenJS.prototype.writeFile;
      let generationPromise = null;
      
      PptxGenJS.prototype.writeFile = function(args) {
        console.log("BDS Sandbox: pptx.writeFile() intercepted");
        generationPromise = this.write({ outputType: 'base64' });
        return generationPromise;
      };

      // Execute the AI code. 
      const func = new AsyncFunction(code);
      await func();
      
      if (generationPromise) {
        const capturedBase64 = await generationPromise;
        window.parent.postMessage({ type: "PPTX_RESULT", base64: capturedBase64, id }, "*");
      } else {
        throw new Error("No PPTX data was generated. Did the script call pptx.writeFile()?");
      }

      PptxGenJS.prototype.writeFile = originalWriteFile;
    } catch (err) {
      console.error("BDS Sandbox Error (PPTX):", err);
      window.parent.postMessage({ type: "PPTX_ERROR", error: err.message, id }, "*");
    }
  }

  if (type === "GEN_EXCEL") {
    console.log("BDS Sandbox: Received Excel generation request", id);
    try {
      let capturedBase64 = null;

      // Create a wrapper for XLSX to intercept writeFile
      const XLSX_WRAPPER = {
        ...XLSX,
        writeFile: (wb, filename, opts) => {
          console.log("BDS Sandbox: XLSX.writeFile() intercepted");
          capturedBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', ...opts });
        }
      };

      // Temporarily override global XLSX for this execution
      const originalGlobalXLSX = window.XLSX;
      window.XLSX = XLSX_WRAPPER;

      const func = new AsyncFunction(code);
      await func();

      if (capturedBase64) {
        window.parent.postMessage({ type: "EXCEL_RESULT", base64: capturedBase64, id }, "*");
      } else {
        throw new Error("No Excel data was generated. Did the script call XLSX.writeFile()?");
      }

      // Restore
      window.XLSX = originalGlobalXLSX;
    } catch (err) {
      console.error("BDS Sandbox Error (Excel):", err);
      window.parent.postMessage({ type: "EXCEL_ERROR", error: err.message, id }, "*");
    }
  }

  if (type === "GEN_DOCX") {
    console.log("BDS Sandbox: Received DOCX generation request", id);
    try {
      let generationPromise = null;

      // Create a wrapper for docx to provide a simple save() method and intercept Packer
      const DOCX_WRAPPER = {
        ...docx,
        save: (doc) => {
          console.log("BDS Sandbox: docx.save() called");
          generationPromise = docx.Packer.toBase64String(doc);
          return generationPromise;
        },
        Packer: {
          ...docx.Packer,
          toBase64String: (doc, ...args) => {
            console.log("BDS Sandbox: Packer.toBase64String() intercepted");
            generationPromise = docx.Packer.toBase64String(doc, ...args);
            return generationPromise;
          },
          toBlob: (doc, ...args) => {
            console.log("BDS Sandbox: Packer.toBlob() intercepted");
            generationPromise = docx.Packer.toBase64String(doc, ...args);
            return docx.Packer.toBlob(doc, ...args);
          }
        }
      };

      // Temporarily override globals
      const originalDocx = window.docx;
      const originalDOCX = window.DOCX;
      const originalPacker = window.Packer;

      window.docx = DOCX_WRAPPER;
      window.DOCX = DOCX_WRAPPER;
      window.Packer = DOCX_WRAPPER.Packer;

      const func = new AsyncFunction(code);
      await func();

      if (generationPromise) {
        const capturedBase64 = await generationPromise;
        window.parent.postMessage({ type: "DOCX_RESULT", base64: capturedBase64, id }, "*");
      } else {
        throw new Error("No Word document data was generated. Did the script call DOCX.save(doc) or Packer.toBlob(doc)?");
      }

      window.docx = originalDocx;
      window.DOCX = originalDOCX;
      window.Packer = originalPacker;
    } catch (err) {
      console.error("BDS Sandbox Error (DOCX):", err);
      window.parent.postMessage({ type: "DOCX_ERROR", error: err.message, id }, "*");
    }
  }
});

