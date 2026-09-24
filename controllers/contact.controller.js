const catchAsync = require("../utils/catchAsync");
const contactService = require("../services/contact.service");

exports.submit = catchAsync(async (req, res) => {
  const data = await contactService.submitInquiry(req.validatedBody);
  res.json({ data });
});
