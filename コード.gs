const CALENDER_ID="" //カレンダーID(メールアドレス)
const LINE_TOKEN="" //LINE TOKEN
const ZOOM_API_KEY = ""
const ZOOM_SECRET = ""
const ZOOM_JWT = ""
const SLACK_WEBHOOK = ""

// カレンダー変更時に実行される関数
function onCalendarEdit() {
  let properties = PropertiesService.getScriptProperties();
  let nextSyncToken = properties.getProperty("syncToken");
  let optionalArgs = {
    syncToken: nextSyncToken,
    showDeleted: true
  };
  // カレンダーから情報を取得
  let events = Calendar.Events.list(CALENDER_ID, optionalArgs);
  nextSyncToken = events["nextSyncToken"];
  properties.setProperty("syncToken", nextSyncToken);

  // 情報を切り出す
  let obj=events
  let message=""
  let status=""
  Logger.log(obj)
  try{
      let zoomUrl=""
      if(obj.items[0].status=="tentative" || obj.items[0].status=="confirmed"){
        // 新規・更新
        if(compareDateTime(obj.items[0].created,obj.items[0].updated)){
          // 新規
          status="新規"
          // Zoomミーティングルーム作成
          if(obj.items[0].summary.search("zoom") >= 0 ){
            zoomUrl = onCreateMeetingEvent(obj.items[0].summary, obj.items[0].start.dateTime)
          }

        } else {
          // 更新
          status="更新"
        }
      } else if(obj.items[0].status=="cancelled"){
        // 削除
        status="削除"
      }

      // メッセージ作成
      if(obj.items[0].start.dateTime!=null){
        message = `【${status}】${formatDate(obj.items[0].start.dateTime)} - ${formatDate(obj.items[0].end.dateTime)}  ${obj.items[0].summary}\n ${zoomUrl}`
      }else{
        message = `【${status}】${formatDate(obj.items[0].start.date,2)} 00:00 - ${formatDate(obj.items[0].end.date,3)} 23:59  ${obj.items[0].summary}\n ${zoomUrl}}`
      }

      // LINEメッセージ送信
      sendToLine(message)

      // Slackに送信
      if(zoomUrl != ""){
        sendSlack(message)
      }

    } catch(e){
      Logger.log("エラー:" + e)
    }
}

function sendSlack(text){
  param={"text":text}
  let options =
   {
     "method"  : "POST",
     "headers" : {
        "Content-Type": "application/json",
     },
     "payload": JSON.stringify(param)
   };
  
   // 送信
   return UrlFetchApp.fetch(SLACK_WEBHOOK, options);
}

// LINEに通知する関数
function sendToLine(text){
  // 一番初めに張り付けたトークンを呼び出しています
  let token = LINE_TOKEN;

  let options =
   {
     "method"  : "post",
     "headers" : {"Authorization" : "Bearer "+ token},
     "payload" : "message=" + text

   };
  
   // 送信
   UrlFetchApp.fetch("https://notify-api.line.me/api/notify", options);
}

// ZoomAPIを実行する関数
function fetchZoom(url, param, method){

  let options =
   {
     "method"  : method,
     "headers" : {
        "Content-Type": "application/json",
        "Authorization" : "Bearer "+ ZOOM_JWT}, 
   };

  if(method == "POST"){
    options["payload"] = JSON.stringify(param);
  }
  
   // 送信
   return UrlFetchApp.fetch(url, options);
}

// UserId一覧の取得
function getZoomUserIds(){
  let res = fetchZoom("https://api.zoom.us/v2/users", {} ,"GET")
  let userIds=[]
  if(res.getResponseCode() == 200 || res.getResponseCode() == 201){
    let user_obj = JSON.parse(res.getContentText());
    for(i in user_obj["users"]){
      userIds.push(user_obj["users"][i]["id"]);
      Logger.log(`get user id:${user_obj["users"][i]["id"]}`);
    }
  } else{
    Logger.log(`エラー:${res.getResponseCode()}/${response.getContentText()}`);
  }

  return userIds
}

// Meetingの作成
function createZoomMeeting(userId, title, startTime){
  let param = {
        'topic':title,
        'type' :2,
        'time_zone':'Asia/Tokyo',
        'start_time': startTime,
        'agenda':'',
        'settings':{
          'host_video':false,
          'participant_video':true,
          'approval_type':0,
          'audio':'both',
          'enforce_login':false,
          'waiting_room':false,
        }
  }
  let res = fetchZoom(`https://api.zoom.us/v2/users/${userId}/meetings`, param ,"POST")

  if(res.getResponseCode() == 200 || res.getResponseCode() == 201){
    let obj = JSON.parse(res.getContentText());
    return obj["join_url"]
  } else{
    Logger.log(`エラー:${res.getResponseCode()}/${res.getContentText()}`);
    return false
  }
}

function onCreateMeetingEvent(title, startTime){
  let userIds = getZoomUserIds()
  let joinUrl = createZoomMeeting(userIds[0],title,startTime)
  return joinUrl
}

// 日付時刻フォーマットを変換する関数
function formatDate(str,mode=1){
  let date=new Date(str);
  if(mode==1){
    return Utilities.formatDate(date, 'JST', 'MM/dd HH:mm');
  }else if(mode==2){
    return Utilities.formatDate(date, 'JST', 'MM/dd');
  }else if(mode==3){
    date.setDate(date.getDate()-1)
    return Utilities.formatDate(date, 'JST', 'MM/dd');
  }
}

// 日付時刻を比較する関数
function compareDateTime(str,str2){
  let date1=new Date(str);
  let date2=new Date(str2);

  // 作成日時と更新日時の差が1秒以下(1000ミリ秒)ならば新規作成とみなす
  if((date2-date1)<=1000){
    return true;
  } else {
    return false;
  }
}
