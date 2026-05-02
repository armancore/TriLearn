const { createController } = require('../utils/controllerAdapter')
const {
  createNotice: createNoticeService,
  getAllNotices: getAllNoticesService,
  getNoticeById: getNoticeByIdService,
  updateNotice: updateNoticeService,
  deleteNotice: deleteNoticeService
} = require('../services/notice.service')

const createNotice = createController(createNoticeService)
const getAllNotices = createController(getAllNoticesService)
const getNoticeById = createController(getNoticeByIdService)
const updateNotice = createController(updateNoticeService)
const deleteNotice = createController(deleteNoticeService)

module.exports = {
  createNotice: createNotice,
  getAllNotices: getAllNotices,
  getNoticeById: getNoticeById,
  updateNotice: updateNotice,
  deleteNotice: deleteNotice
}
