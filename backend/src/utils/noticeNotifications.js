const prisma = require('./prisma')
const { createNotifications } = require('./notifications')
const { inferNoticeLink } = require('./notificationLinks')

const uniqueUserIds = (/** @type {string[]} */ userIds = []) => [...new Set(userIds.filter(Boolean))]

/** @param {import("@prisma/client").Notice} notice @returns {import("@prisma/client").Prisma.UserWhereInput} */
const getNoticeRecipientWhere = (notice) => {
  if (notice.audience === 'INSTRUCTORS_ONLY') {
    return {
      isActive: true,
      role: 'INSTRUCTOR',
      ...(notice.targetDepartment ? {
        instructor: {
          is: {
            OR: [
              { department: notice.targetDepartment },
              {
                departmentMemberships: {
                  some: {
                    department: {
                      is: {
                        name: notice.targetDepartment
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      } : {})
    }
  }

  if (notice.audience === 'STUDENTS') {
    return {
      isActive: true,
      role: 'STUDENT',
      student: {
        is: {
          ...(notice.targetDepartment ? { department: notice.targetDepartment } : {}),
          ...(notice.targetSemester ? { semester: notice.targetSemester } : {})
        }
      }
    }
  }

  return {
    isActive: true
  }
}

/** @param {{notice: import("@prisma/client").Notice, title?: string, message?: string, event?: string, excludeUserId?: string}} options */
const createNoticeNotifications = async ({
  notice,
  title = notice.title,
  message = notice.content,
  event = 'NOTICE_POSTED',
  excludeUserId = notice.postedBy
}) => {
  const users = await prisma.user.findMany({
    where: {
      ...getNoticeRecipientWhere(notice),
      ...(excludeUserId ? { id: { not: excludeUserId } } : {})
    },
    select: {
      id: true,
      role: true
    }
  })

  const usersByLink = users.reduce((acc, user) => {
    const link = inferNoticeLink(user.role)
    if (!acc.has(link)) {
      acc.set(link, [])
    }
    acc.get(link).push(user.id)
    return acc
  }, new Map())

  const results = await Promise.all([...usersByLink.entries()].map(([link, userIds]) => (
    createNotifications({
      userIds: uniqueUserIds(userIds),
      type: 'NOTICE_POSTED',
      title,
      message,
      link,
      metadata: {
        noticeId: notice.id,
        audience: notice.audience,
        type: notice.type,
        event
      },
      dedupeKeyFactory: (userId) => (
        event === 'NOTICE_POSTED'
          ? `notice:${notice.id}:${userId}`
          : `notice:${event.toLowerCase()}:${notice.id}:${userId}`
      )
    })
  )))

  return {
    count: results.reduce((total, item) => total + (item?.count || 0), 0),
    results
  }
}

module.exports = {
  createNoticeNotifications,
  getNoticeRecipientWhere
}
