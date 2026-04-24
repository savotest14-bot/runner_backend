const EmailTemplate = require("../models/contractTemplate");
const Task = require("../models/task");

// ✅ FORMAT DURATION
function formatDuration(seconds) {
  if (!seconds) return "-";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

async function buildContractEmail({
  contract,
  client,
  company,
  templateCode,
  themeName,
  frontendUrl
}) {

  const BACKEND_URL = process.env.BACKEND_URL || "";

  const template = await EmailTemplate.findOne({
    templateCode,
    isActive: true
  });

  if (!template) throw new Error("Email template not found");

  let html = template.html;

  const theme = template.themes[themeName];
  if (!theme) throw new Error("Theme not found");

  // ================= APPLY THEME =================
  Object.keys(theme).forEach(key => {
    html = html.replaceAll(`{{${key}}}`, theme[key]);
  });

  // ================= FETCH TASKS + SUBTASKS =================
  const populatedTasks = await Task.find({
    _id: { $in: contract.tasks }
  }).populate("subTasks");

  // ================= TASK + SUBTASK ROW BUILDER =================
  let taskRows = "";

  populatedTasks.forEach((task, index) => {

    // 🔷 TASK HEADER ROW
    taskRows += `
      <tr style="background:#f9fafb; font-weight:bold;">
        <td style="padding:10px;">${index + 1}</td>
        <td colspan="4">${task.taskName || ""}</td>
      </tr>
    `;

    // 🔶 SUBTASK ROWS
    (task.subTasks || []).forEach((sub, subIndex) => {

      const price = Number(sub.subtaskPrice || 0);

      taskRows += `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px;">${index + 1}.${subIndex + 1}</td>
          <td style="padding-left:20px;">${sub.subTaskName || ""}</td>
          <td>${formatDuration(sub.estimatedDurationSeconds)}</td>
          <td>₹ ${price.toLocaleString()}</td>
          <td>₹ ${price.toLocaleString()}</td>
        </tr>
      `;
    });

    // 🔷 TASK TOTAL ROW
    taskRows += `
      <tr style="background:#f3f4f6;">
        <td></td>
        <td colspan="3" align="right"><b>Task Total</b></td>
        <td><b>₹ ${Number(task.taskPrice || 0).toLocaleString()}</b></td>
      </tr>
    `;
  });

  html = html.replaceAll("{{TASK_ROWS}}", taskRows || "");

  // ================= CLIENT ADDRESS =================
  const clientAddress = [
    client.addressLine1,
    client.addressLine2,
    client.city,
    client.state,
    client.country,
    client.pincode
  ].filter(Boolean).join(", ");

  // ================= COMPANY LOGO =================
  const companyLogoFullUrl =
    company?.logo
      ? `${BACKEND_URL}${company.logo}`
      : "";

  // ================= VARIABLES =================
  const companyAddress = [
    company?.address?.addressLine1,
    company?.address?.addressLine2,
    company?.address?.city,
    company?.address?.state,
    company?.address?.country,
    company?.address?.pincode
  ].filter(Boolean).join(", ");

  const companyPhone = [
    company?.phoneCode,
    company?.phoneNumber
  ].filter(Boolean).join(" ");
  html = html
    .replaceAll("{{CLIENT_NAME}}", client.name || "")
    .replaceAll("{{CLIENT_ADDRESS}}", clientAddress)

    .replaceAll("{{COMPANY_NAME}}", company.companyName || "")
    .replaceAll("{{COMPANY_TAGLINE}}", company.tagline || "")
    .replaceAll("{{COMPANY_LOGO}}", companyLogoFullUrl)

    .replaceAll("{{COMPANY_ADDRESS}}", companyAddress)
    .replaceAll("{{COMPANY_PHONE}}", companyPhone)

    .replaceAll("{{INVOICE_NO}}", contract.invoiceNumber || "")
    .replaceAll("{{REFERENCE_NO}}", contract.referenceNumber || "")

    .replaceAll(
      "{{TOTAL}}",
      `₹ ${Number(contract.totalCost || 0).toLocaleString()}`
    );

  // ================= ACCEPT / REJECT =================
  html = html
    .replaceAll(
      "{{ACCEPT_URL}}",
      `${frontendUrl}/api/contract/respond?contractId=${contract._id}&action=accept`
    )
    .replaceAll(
      "{{REJECT_URL}}",
      `${frontendUrl}/api/contract/respond?contractId=${contract._id}&action=reject`
    );

  return html;
}

module.exports = buildContractEmail;