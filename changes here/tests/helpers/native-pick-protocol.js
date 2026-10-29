export function dispatchPickStatus(requestId, phase) {
  window.dispatchEvent(
    new CustomEvent("__bds_native_files_picked_" + requestId, {
      detail: { v: 2, kind: "status", phase },
    }),
  );
}

export function dispatchPickResult(requestId, payload, { chunkSize = 200000 } = {}) {
  const json = JSON.stringify(payload);
  const total = Math.max(1, Math.ceil(json.length / chunkSize));

  for (let seq = 0; seq < total; seq += 1) {
    window.dispatchEvent(
      new CustomEvent("__bds_native_files_picked_" + requestId, {
        detail: {
          v: 2,
          kind: "chunk",
          seq,
          total,
          data: json.slice(seq * chunkSize, (seq + 1) * chunkSize),
        },
      }),
    );
  }
}
