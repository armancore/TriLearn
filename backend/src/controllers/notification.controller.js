const { createController } = require('../utils/controllerAdapter')
const {
  listNotifications: listNotificationsService,
  getUnreadNotificationCount: getUnreadNotificationCountService,
  markNotificationRead: markNotificationReadService,
  markAllNotificationsRead: markAllNotificationsReadService,
  registerDeviceToken: registerDeviceTokenService,
  unregisterDeviceToken: unregisterDeviceTokenService
} = require('../services/notification.service')

const listNotifications = createController(listNotificationsService)
const getUnreadNotificationCount = createController(getUnreadNotificationCountService)
const markNotificationRead = createController(markNotificationReadService)
const markAllNotificationsRead = createController(markAllNotificationsReadService)
const registerDeviceToken = createController(registerDeviceTokenService)
const unregisterDeviceToken = createController(unregisterDeviceTokenService)

module.exports = {
  listNotifications: listNotifications,
  getUnreadNotificationCount: getUnreadNotificationCount,
  markNotificationRead: markNotificationRead,
  markAllNotificationsRead: markAllNotificationsRead,
  registerDeviceToken: registerDeviceToken,
  unregisterDeviceToken: unregisterDeviceToken
}
