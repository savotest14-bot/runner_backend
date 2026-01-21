const nodemailer = require("nodemailer");

exports.sendSimpleMail = async ({ to, subject, html, text }) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"No Reply" <${process.env.MAIL_USERNAME}>`,
    to,
    subject,
    html,
    text,
  });
};
