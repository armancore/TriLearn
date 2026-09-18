/** @satisfies {import('@prisma/client').Prisma.UserSelect} */
const userRoleSelect = {
  student: {
    select: {
      id: true,
      rollNumber: true,
      semester: true,
      section: true,
      department: true
    }
  },
  instructor: {
    select: {
      id: true,
      department: true,
      departmentMemberships: {
        include: {
          department: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  },
  coordinator: {
    select: {
      id: true,
      department: true
    }
  }
}

const getUserSelect = ({ includeProfileDetails = false } = {}) => /** @type {const} */ ({
  id: true,
  name: true,
  email: true,
  role: true,
  avatar: true,
  isActive: true,
  deletedAt: true,
  emailVerified: true,
  mustChangePassword: true,
  profileCompleted: true,
  ...(includeProfileDetails
    ? {
      phone: true,
      address: true,
      createdAt: true,
      student: {
        select: {
          ...userRoleSelect.student.select,
          fatherName: true,
          motherName: true,
          fatherPhone: true,
          motherPhone: true,
          bloodGroup: true,
          localGuardianName: true,
          localGuardianAddress: true,
          localGuardianPhone: true,
          permanentAddress: true,
          temporaryAddress: true,
          dateOfBirth: true
        }
      }
    }
    : userRoleSelect),
  instructor: userRoleSelect.instructor,
  coordinator: userRoleSelect.coordinator
})

const getProfileSelect = () => getUserSelect({ includeProfileDetails: true })

const getRequestUserAgent = (/** @type {ReturnType<typeof import('../utils/controllerAdapter').buildServiceContext>} */ context) => String(context.get('user-agent') || '').slice(0, 255) || null

const getRequestIpAddress = (/** @type {ReturnType<typeof import('../utils/controllerAdapter').buildServiceContext>} */ context) => {
  return String(context.ip || context.socket?.remoteAddress || '').slice(0, 64) || null
}

const waitForMinimumDuration = async (/** @type {number} */ startedAt, /** @type {number} */ minDurationMs) => {
  const elapsed = Date.now() - startedAt
  if (elapsed >= minDurationMs) {
    return
  }

  await new Promise((resolve) => {
    setTimeout(resolve, minDurationMs - elapsed)
  })
}

module.exports = {
  getUserSelect,
  getProfileSelect,
  getRequestUserAgent,
  getRequestIpAddress,
  waitForMinimumDuration
}
