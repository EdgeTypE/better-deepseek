(() => {
  "use strict";

  const CRC_TABLE = buildCrcTable();

  function buildCrcTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        if (c & 1) {
          c = 0xedb88320 ^ (c >>> 1);
        } else {
          c >>>= 1;
        }
      }
      table[i] = c >>> 0;
    }
    return table;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      const index = (crc ^ bytes[i]) & 0xff;
      crc = CRC_TABLE[index] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function toUint16LE(value) {
    return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
  }

  function toUint32LE(value) {
    return Uint8Array.from([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    ]);
  }

  function concat(parts) {
    let totalLength = 0;
    for (const part of parts) {
      totalLength += part.length;
    }

    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  function encodeText(text) {
    return new TextEncoder().encode(text);
  }

  function normalizePath(inputPath) {
    const cleaned = String(inputPath || "")
      .replace(/\\/g, "/")
      .replace(/^[A-Za-z]:/, "")
      .replace(/^\/+/, "");

    const parts = cleaned
      .split("/")
      .filter((part) => part && part !== "." && part !== "..");

    return parts.join("/") || "file.txt";
  }

  function getDosDateTime() {
    const now = new Date();
    const year = Math.max(now.getFullYear(), 1980);
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();

    const dosTime = ((hour & 0x1f) << 11) | ((minute & 0x3f) << 5) | ((second / 2) & 0x1f);
    const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);

    return { dosDate, dosTime };
  }

  function buildZip(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("buildZip expects a non-empty files array.");
    }

    const localHeaders = [];
    const centralHeaders = [];
    let localOffset = 0;

    const { dosDate, dosTime } = getDosDateTime();

    for (const file of files) {
      const normalizedPath = normalizePath(file.path || file.fileName);
      const pathBytes = encodeText(normalizedPath);
      const contentBytes = encodeText(String(file.content || ""));
      const checksum = crc32(contentBytes);

      const localHeader = concat([
        toUint32LE(0x04034b50),
        toUint16LE(20),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(dosTime),
        toUint16LE(dosDate),
        toUint32LE(checksum),
        toUint32LE(contentBytes.length),
        toUint32LE(contentBytes.length),
        toUint16LE(pathBytes.length),
        toUint16LE(0),
        pathBytes,
        contentBytes
      ]);

      localHeaders.push(localHeader);

      const centralHeader = concat([
        toUint32LE(0x02014b50),
        toUint16LE(20),
        toUint16LE(20),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(dosTime),
        toUint16LE(dosDate),
        toUint32LE(checksum),
        toUint32LE(contentBytes.length),
        toUint32LE(contentBytes.length),
        toUint16LE(pathBytes.length),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(0),
        toUint32LE(0),
        toUint32LE(localOffset),
        pathBytes
      ]);

      centralHeaders.push(centralHeader);
      localOffset += localHeader.length;
    }

    const centralDirectory = concat(centralHeaders);
    const localData = concat(localHeaders);

    const endOfCentralDirectory = concat([
      toUint32LE(0x06054b50),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(files.length),
      toUint16LE(files.length),
      toUint32LE(centralDirectory.length),
      toUint32LE(localData.length),
      toUint16LE(0)
    ]);

    return new Blob([localData, centralDirectory, endOfCentralDirectory], {
      type: "application/zip"
    });
  }

  window.BDSZip = {
    buildZip
  };
})();
