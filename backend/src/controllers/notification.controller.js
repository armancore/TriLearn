delete require.cache[require.resolve('../services/notification.service')]
const {
  listNotifications: listNotificationsService,
  getUnreadNotificationCount: getUnreadNotificationCountService,
  markNotificationRead: markNotificationReadService,
  markAllNotificationsRead: markAllNotificationsReadService,
  registerDeviceToken: registerDeviceTokenService,
  unregisterDeviceToken: unregisterDeviceTokenService
} = require('../services/notification.service')

const listNotifications = async (req, res) => {
  return listNotificationsService(req, res)
}

const getUnreadNotificationCount = async (req, res) => {
  return getUnreadNotificationCountService(req, res)
}

const markNotificationRead = async (req, res) => {
  return markNotificationReadService(req, res)
}

const markAllNotificationsRead = async (req, res) => {
  return markAllNotificationsReadService(req, res)
}

const registerDeviceToken = async (req, res) => {
  return registerDeviceTokenService(req, res)
}

const unregisterDeviceToken = async (req, res) => {
  return unregisterDeviceTokenService(req, res)
}
module.exports = {
  listNotifications: listNotifications,
  getUnreadNotificationCount: getUnreadNotificationCount,
  markNotificationRead: markNotificationRead,
  markAllNotificationsRead: markAllNotificationsRead,
  registerDeviceToken: registerDeviceToken,
  unregisterDeviceToken: unregisterDeviceToken
}
