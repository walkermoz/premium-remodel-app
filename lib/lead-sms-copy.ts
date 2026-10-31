export function websiteLeadSmsBody(businessName: string, project: string) {
  const business = businessName.trim();
  const projectName = project.trim();
  const company = business.length <= 18 ? business || "Our team" : "Our team";
  const request =
    projectName.length <= 18 ? projectName || "remodeling" : "remodeling";
  return `${company}: We received your ${request} request. A member of our team will be in touch soon to schedule a visit. STOP to opt out; HELP for help.`;
}
