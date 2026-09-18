/** Safely describe failures, including non-Error values thrown by integrations.
 * @param {unknown} error
 */
const errorInfo = (error) => {
  const fields = error !== null && typeof error === 'object' ? error : {}
  return {
    message: 'message' in fields && typeof fields.message === 'string' ? fields.message : String(error),
    stack: 'stack' in fields && typeof fields.stack === 'string' ? fields.stack : undefined,
    code: 'code' in fields && typeof fields.code === 'string' ? fields.code : undefined,
    status: 'status' in fields && typeof fields.status === 'number' ? fields.status : undefined,
    details: 'details' in fields ? fields.details : undefined
  }
}
module.exports = { errorInfo }
