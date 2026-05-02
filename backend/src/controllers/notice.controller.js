delete require.cache[require.resolve('../services/notice.service')]
const {
  createNotice: createNoticeService,
  getAllNotices: getAllNoticesService,
  getNoticeById: getNoticeByIdService,
  updateNotice: updateNoticeService,
  deleteNotice: deleteNoticeService
} = require('../services/notice.service')

const createNotice = async (req, res) => {
  return createNoticeService(req, res)
}

const getAllNotices = async (req, res) => {
  return getAllNoticesService(req, res)
}

const getNoticeById = async (req, res) => {
  return getNoticeByIdService(req, res)
}

const updateNotice = async (req, res) => {
  return updateNoticeService(req, res)
}

const deleteNotice = async (req, res) => {
  return deleteNoticeService(req, res)
}
module.exports = {
  createNotice: createNotice,
  getAllNotices: getAllNotices,
  getNoticeById: getNoticeById,
  updateNotice: updateNotice,
  deleteNotice: deleteNotice
}
