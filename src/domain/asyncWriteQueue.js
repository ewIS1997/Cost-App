export function createAsyncWriteQueue() {
  let tail = Promise.resolve()
  return {
    enqueue(write) {
      const current = tail.catch(() => {}).then(write)
      tail = current
      return current
    },
    idle() {
      return tail.catch(() => {})
    },
  }
}
