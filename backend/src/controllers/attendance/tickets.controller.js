delete require.cache[require.resolve('../../services/attendance/tickets.service')]
const {
  getMyAbsenceTickets: getMyAbsenceTicketsService,
  createAbsenceTicket: createAbsenceTicketService,
  getAbsenceTicketsForStaff: getAbsenceTicketsForStaffService,
  reviewAbsenceTicket: reviewAbsenceTicketService
} = require('../../services/attendance/tickets.service')

const getMyAbsenceTickets = async (req, res) => {
  return getMyAbsenceTicketsService(req, res)
}

const createAbsenceTicket = async (req, res) => {
  return createAbsenceTicketService(req, res)
}

const getAbsenceTicketsForStaff = async (req, res) => {
  return getAbsenceTicketsForStaffService(req, res)
}

const reviewAbsenceTicket = async (req, res) => {
  return reviewAbsenceTicketService(req, res)
}
module.exports = {
  getMyAbsenceTickets: getMyAbsenceTickets,
  createAbsenceTicket: createAbsenceTicket,
  getAbsenceTicketsForStaff: getAbsenceTicketsForStaff,
  reviewAbsenceTicket: reviewAbsenceTicket
}
