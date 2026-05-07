function setMyProperties() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'GEMINI_API_KEY': 'AIzaSyAIOI9iYxwrGIFWD0otKiXzTvLtr8g2XOM',
    'TEAM_REGISTRY_SPREADSHEET_ID': '1CTOaK7Kt2s6nF4ljVNejDC_LKkNjCqZQum2zQCTAU5U',
    'DASHBOARD_SPREADSHEET_ID': '1UoY81SPitbN7y2yYuP5g5cy6bJS1xltfU2PAXMiTwgI',
    'TASKS_SPREADSHEET_ID': '12Y7EoiSgTa-G8MUHIWwvTf2ZnBGI7sjaYRcVIdsnAL4',
    'PROJECTS_SPREADSHEET_ID': '1e8fwRlrh8VaHvZruuzArB5HY77vG_uss8u6M4mpTJT8',
    'KB_SPREADSHEET_ID': '1wEceEo7zaEzf7kvKUuUlGLHtmXfeZKOVBacMy5jKE40',
    'LOG_SPREADSHEET_ID': '1zJaUAn5ahpr4-lMfBUrzNM4jlOtdD8uzrDK7NHQYbZQ',
    'TEAM_CHAT_SPACE_ID': 'AAQAN9ONUtA',
    'APPROVALS_CHAT_SPACE_ID': 'AAQAsgmMlkc',
    'TEAM_DRIVE_FOLDER_ID': '1SXJKH0RZF-wgKCKgh4yg7rluZP-5gQLz',
    'PROJECTS_DRIVE_FOLDER_ID': '19DQUYItP1LHSIxe6e3JmQNxfgB60DkPS',
  });
  Logger.log("Properties Set Successfully!");
}
