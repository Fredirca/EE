!function(a){"use strict";if("function"==typeof define&&define.amd)define(["jquery"],a);else if("object"==typeof exports)a(require("jquery"));else{if("undefined"==typeof jQuery)throw"jquery-numerator requires jQuery to be loaded first";a(jQuery)}}(function(a){function d(d,e){this.element=d,this.settings=a.extend({},c,e),this._defaults=c,this._name=b,this.init()}var b="numerator",c={easing:"swing",duration:500,delimiter:void 0,rounding:0,toValue:void 0,fromValue:void 0,queue:!1,onStart:function(){},onStep:function(){},onProgress:function(){},onComplete:function(){}};d.prototype={init:function(){this.parseElement(),this.setValue()},parseElement:function(){var b=a.trim(a(this.element).val().replace("$ ",""));this.settings.fromValue=this.settings.fromValue||this.format(b)},setValue:function(){var b=this;a({value:b.settings.fromValue}).animate({value:b.settings.toValue},{duration:parseInt(b.settings.duration,10),easing:b.settings.easing,start:b.settings.onStart,step:function(c,d){a(b.element).val(b.format(c)+" $"),b.settings.onStep(c,d)},progress:b.settings.onProgress,complete:b.settings.onComplete})},format:function(a){var b=this;return a=parseInt(this.settings.rounding)<1?parseInt(a,10):parseFloat(a).toFixed(parseInt(this.settings.rounding)),b.settings.delimiter?this.delimit(a):a},delimit:function(a){var b=this;if(a=a.toString(),b.settings.rounding&&parseInt(b.settings.rounding,10)>0){var c=a.substring(a.length-(b.settings.rounding+1),a.length),d=a.substring(0,a.length-(b.settings.rounding+1));return b.addDelimiter(d)+c}return b.addDelimiter(a)},addDelimiter:function(a){return a.toString().replace(/\B(?=(\d{3})+(?!\d))/g,this.settings.delimiter)}},a.fn[b]=function(c){return this.each(function(){a.data(this,"plugin_"+b)&&a.data(this,"plugin_"+b,null),a.data(this,"plugin_"+b,new d(this,c))})}});

let isSteamInventoryLoading = false;
let isSiteInventoryLoading = false;

function showPopup(t, e, o) {
    $(".popup:visible").remove();
    var n = "popup" + +new Date,
        a = $(".popup.popupTemplate")[0].outerHTML.replace("popup popupTemplate", n + " popup popupTemplate");
    $("#overlay").append(a);
    var s = $("." + n);
    s.find(".header").html(t), s.find(".content").html(e);
    var r = "";
    for (i in o) r += '<div class="' + o[i]["class"] + '">' + o[i].text + "</div>";
    return s.find(".buttons").html(r), r.length || s.find(".buttons").remove(), $("#overlay").fadeIn(150), s.removeClass("hidden"), s.find(".buttons .disabled").removeClass("disabled"), setTimeout(function() {
        s.addClass("visible")
    }, 150), s
}
function closePopup() {
    $(".popup:visible").each(function() {
        $(this).removeClass("visible"),
            function(t) {
                setTimeout(function() {
                    t.remove()
                }, 350)
            }($(this))
    }), $("#overlay").fadeOut(150)
}

function replaceLogin(name){if (name==undefined){return "";}var findme=['.ru','.com','.org','.net','.ua','.cc'];var pos1=false;var nik=name;var mystr=nik.toLowerCase();pos1=stripos(mystr,siteDomain);if(pos1!==false){return name;}pos1=stripos(mystr,siteDomain);if(pos1!==false){return name;}findme.forEach(function(item,i,arr){pos1=stripos(mystr,item);if(pos1!=false){nik=tsnl(mystr,pos1,name);return(nik)}});return(nik)}function tsnl(dat,pos,name){arrfnd=['-','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];var q=dat.length-pos+1;while(q<=dat.length){if(arrfnd.indexOf(dat.substr(-1*(q),1))==-1){return(name.substr(0,stripos(dat,dat.substr(-1*(q),1))))}q++}}function stripos(f_haystack,f_needle,f_offset){var haystack=f_haystack.toLowerCase();var needle=f_needle.toLowerCase();var index=0;if(f_offset==undefined){f_offset=0}if((index=haystack.indexOf(needle,f_offset))>-1){return index}return false}

function sort() {
	var myArray = $('#participant_list .simplebar-content div');
	myArray.sort(function (a, b) {
	    
	    // convert to integers from strings
	    a = parseInt($(a).attr("data-chance"), 10);
	    b = parseInt($(b).attr("data-chance"), 10);
	    // compare
	    if(a > b) {
	        return 1;
	    } else if(a < b) {
	        return -1;
	    } else {
	        return 0;
	    }
	});
	$('#participant_list .simplebar-content').html(myArray);
}

function showWinnerPopup(t) {
    if (t.sentOfferId) {
        var e = "",
            o = [];
        if (t.sentOfferId) o = [{
            "class": "accept",
            text: '<a target="_blank" href="https://steamcommunity.com/tradeoffer/' + t.sentOfferId + '/">Accept Trade Offer</a>'
        }, {
            "class": "cancel",
            text: "Close"
        }], e += '<div id="winDetails">', e += 'The trade offer containing your winning items has been sent.<br>Please accept the trade offer as soon as possible by clicking on "accept trade offer" below.<br><br>', e += "</div>";
        else {
            if ($("#winSpinner").is(":visible")) return;
            e += '<div id="winSpinner" class="center">', e += "Please wait while we prepare the trade offer containing the items you just won..", e += '<br /><br /><br /><br /><img src="/img/loading_big.gif" /></div>'
        }
        var n = showPopup("Congratulations, you have won in game!", e, o);
        n.find(".buttons > div").unbind("click").on("click", function() {
            1 == $(this).index() && closePopup()
        }), n.find(".buttons > div:first a").on("click", function(t) {
            closePopup()
        })
    }
}

function scrollChatToBottom(t) {
    var o = $(".chat .messagelist").simplebar().simplebar("getScrollElement");
    $(".chat .messagelist").simplebar("recalculate");
    var n = o && o[0] && o[0].scrollHeight;
    o.scrollTop(n+100);
}
function showWinnerUI(t) {
	// var sound1 = new Audio("/sounds/choosing.mp3"); sound1.play();
	var e = $(".mainbox").outerWidth() / 4 * 4;
  $(".winnerinfo").css({
    width: e + "px"
  });
  var n = $(".potwinner_pic");
  n.html("").css("margin-left", 0);
  var o = "";
  if($("#participant_list .user").length <= 1){
    return false;
  }
  $("#participant_list .user").each(function() {
      for (var j = $(this).data("chance"), e = 0; j > e; e++) o += '<img data-chance="' + j + '" data-steamid="' + $(this).data("steamid") + '" onerror="imgError(this);" src="' + imgF($(this).find("img").attr("src")) + '">'
  }), n.html(o);
  n.html(shuffle(n.children().get()));
  $winnerDiv = $(".winnerinfo");
  $winnerDiv.find(".message a").html(t.name);
  var i = parseInt($("#jackpot_info").data("count")),
      a = parseInt($("#jackpot_info").data("worth"));
  $winnerDiv.find("#numItemsWon").html(i + " item" + (1 != i ? "s" : ""));
  $winnerDiv.find("#wonItemsWorth").html(a.toFixed(2) + " $");
  $winnerDiv.fadeIn(250, function() {
    var b = $('.potwinner_pic img[data-steamid="' + t.steamid + '"]').last(),
        i = 0;
    n.children().each(function() {
        5 >= i && n.append($(this)[0].outerHTML), i++
    });
    var a = 147 * (b.index() + 1);
    a -= e / 2, a -= Math.floor(114 * Math.random()) + 14, n.animate({
        "margin-left": -1 * a + "px"
    }, 9e3, "easeOutCirc", function() {
        b.addClass("highlight"), $(".potwinner .message").fadeIn(150), setTimeout(function() {
            $(".winnerinfo").fadeOut(250), $(".potwinner .message").fadeOut(250)
        }, 12500)
    })
  })
}
function updatePageTitle() {
    var t = $("title");
    if ($("#jackpot_info").length) {
        var e = $("#jackpot_info").data("cd"),
            o = $("#jackpot_info").data("worth");
        t.html(Number(o).toFixed(0)+ "$" + (e > 0 ? " - " + e + "s" : "") + " - "+siteDomain)
    }
}
function showNotification(t) {
    var e = "notification_" + +new Date;
    $("#notification_list").show().append('<div id="' + e + '" class="alert' + (-1 != t.toLowerCase().indexOf("warning") ? " warning" : "") + '">' + t + "</div>"), setTimeout(function() {
        $("#" + e).fadeOut(150, function() {
            $(this).remove(), $("#notification_list > div").length || $("#notification_list").hide()
        })
    }, 5e3)
}
function showGoodNotification(t) {
    var e = "notification_" + +new Date;
    $("#notification_list").show().append('<div id="' + e + '" class="alert successfuly">' + t + "</div>"), setTimeout(function() {
        $("#" + e).fadeOut(150, function() {
            $(this).remove(), $("#notification_list > div").length || $("#notification_list").hide()
        })
    }, 5e3)
}
function showPersonalNotification(t) {
    var e = "notification_" + +new Date;
    $("#notification_list").show().append('<div id="' + e + '" class="alert personal_message">' + t + "</div>"), setTimeout(function() {
        $("#" + e).fadeOut(150, function() {
            $(this).remove(), $("#notification_list > div").length || $("#notification_list").hide()
        })
    }, 20e3)
}
function showConfirmNotification(t) {
  var popwindow = $('.popwindow');
  $("body").prepend("<div class='mask'></div>");
  function preparewindow(windowobject) {
    var winwidth = windowobject.data("width");
    var winheight = windowobject.data("height");
    var winmargin = winwidth / 2;
    var wintitle = windowobject.data("title");
    windowobject.wrap("<div class='box_window'></div>");
    windowobject.addClass("box_window_in");
    windowobject.css("cursor","pointer");
    windowobject.parent(".box_window").prepend("<div class='box_title'>"+wintitle+"</div>");
    windowobject.parent(".box_window").css({'width':winwidth,'height':winheight,'margin-left':'-'+winmargin});
    windowobject.css({'height':winheight});
    windowobject.css({'display':"block"});
    windowobject.find('#more_cat').on("click", function(){
      windowobject.unwrap();
      windowobject.css({'display':"none"});
      $('.mask').remove();
    })
  }
  if (popwindow.length) {
    preparewindow(popwindow);
    var idwind = 1;
    $("#" + idwind + " p:last").text(t);
    $("#" + idwind).parent(".box_window").fadeIn().addClass("windactiv");
    $(".mask").fadeIn();
    $(".to_blur").addClass("blur");
  };
}
function imgError(image,itmname) {
  return;
    image.onerror = "";
    image.src = "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";
    return true;
}
function imgF(img_){
  if(img_.indexOf("http:")!=-1){
    return "https://images.weserv.nl/?url="+img_;
  }else{return img_}
}
function fPrice(_type, _price){
  if(_type){
    return (_price == -1 ? "No Price" : parseFloat(_price).toFixed(2));
  } else {
    return (_price == -1 ? 0 : parseFloat(_price).toFixed(2));
  }
}

function shuffle(t) {for (var e, o, n = t.length; n; e = parseInt(Math.random() * n), o = t[--n], t[n] = t[e], t[e] = o);return t}
function hasSoundsEnabled() {return !localStorage.getItem("muteSounds")}
function bindTooltipsSteamInv() {
  destroyTooltipsItems('.tooltip-steam-inv');
  bindTooltips('.tooltip-steam-inv');
}

function bindTooltipsUserInv() {
  destroyTooltipsItems('.tooltip-steam-inv');
  bindTooltips('.tooltip-steam-inv');
}

function bindTooltipsSiteInv() {
  destroyTooltipsItems('.tooltip-site-inv');
  bindTooltips('.tooltip-site-inv');
}


function bindTooltipsWinnersInv() {
  destroyTooltipsItems('.tooltip-winner');
  bindTooltips('.tooltip-winner');
}


function bindTooltipsItems() {
  destroyTooltipsItems('.has-tooltip');
  bindTooltips('.has-tooltip');
}

function bindTooltips(className)
{
  Tipped.create(className)
}

function destroyTooltipsItems(className) {
  Tipped.remove(className);
}

var notyfs = [];
var summaSiteInv = 0.00;
var summaSteamInv = 0.00;

function priceFormatStr(price)
{
  if(price <= 0.01)
    return 0;

  let tousands = price / 1000;

  if(tousands >= 100)
  {
    return `${tousands.toFixed(2)} K`;
  }

  return price.toFixed(2);
}

function updateSelectAllSiteButton()
{
  let buttonId = "#siteSelectAllButton";
  let selectFuncStr = "selectSiteInventoryAll();";
  let unselectFuncStr = "unselectSiteInventoryAll();";

  let selectedCount = calculateSelectedItems(".siteinventar");
  let totalItems = calculateTotalItems(".siteinventar");

  updateSelectAllButton(buttonId, selectFuncStr, unselectFuncStr, selectedCount, totalItems);
}

function updateSelectAllSteamButton()
{
  let buttonId = "#steamSelectAllButton";
  let selectFuncStr = "selectSteamInventoryAll();";
  let unselectFuncStr = "unselectSteamInventoryAll();";

  let selectedCount = calculateSelectedItems(".inventar");
  let totalItems = calculateTotalItems(".inventar");

  updateSelectAllButton(buttonId, selectFuncStr, unselectFuncStr, selectedCount, totalItems);
}

function updateSelectAllButton(buttonId, selectFuncStr, unselectFuncStr, selectedCount, totalItems)
{
  let button = $(buttonId);

  if(selectedCount == totalItems && totalItems != 0) {
    button.attr("onclick", unselectFuncStr);
  } else {
    button.attr("onclick", selectFuncStr);
  }
}

function selectItem(element, unselectFunction) {
  var thisItem = $(element);
  thisItem.addClass("active");
  thisItem.attr("onclick", unselectFunction);
  var elemPrice = thisItem.find('.item_info label').text();
  elemPrice = elemPrice.split(' ')[0];
  if (elemPrice=="No Price") elemPrice = 0;

  return parseFloat(Number(elemPrice));
}

function unselectItem(element, selectFunction) {
  var thisItem = $(element);
  thisItem.removeClass("active"), thisItem.attr("onclick", selectFunction);
  var elemPrice = thisItem.find('.item_info label').text();
  elemPrice = elemPrice.split(' ')[0];
  if (elemPrice=="No Price") elemPrice = 0;
  return parseFloat(elemPrice);
}

function selectItemSite(element) {
  let price = selectItem(element, "unselectItemSite(this);");
  summaSiteInv+=price;
  setPrice("#selected_price_site", summaSiteInv);

  updateSelectAllSiteButton();
}

function selectItemSteam(element) {
  let price = selectItem(element, "unselectItemSteam(this);");
  summaSteamInv+=price;
  setPrice("#selected_price", summaSteamInv);

  updateSelectAllSteamButton();
}

let pricesHashMap = { };

function setPrice(elementFindQuery, price)
{
  $(elementFindQuery).text(priceFormatStr(price));
  pricesHashMap[elementFindQuery] = price;
}

function getPrice(priceId)
{
  let price = pricesHashMap[priceId];

  if(!price)
    return 0;

  return price;
}

function unselectItemSite(element) {
  let price = unselectItem(element, "selectItemSite(this);");
  summaSiteInv-=price;

  setPrice("#selected_price_site", summaSiteInv);
  updateSelectAllSiteButton();
}

function unselectItemSteam(element) {
  let price = unselectItem(element, "selectItemSteam(this);");
  summaSteamInv-=price;
  setPrice("#selected_price", summaSteamInv);

  updateSelectAllSteamButton();
}

function calculateSelectedItems(invClass)
{
  return $(invClass + " .item.active").toArray().length
}

function calculateTotalItems(invClass)
{
  return $(invClass + " .item").toArray().length
}

function selectSteamInventoryAll(argument) {
  unselectSteamInventoryAll();
  setPrice("#selected_price", 0); summaSteamInv = 0;
    $(".inventar .item:not(.active)").each(function(idnx){
      // if(!isItemSelected(this))
      selectItemSteam(this);
    }); 

    updateSelectAllSteamButton();
}

function unselectSteamInventoryAll(argument) {
  
  $(".inventar .item.active").each(function(idnx){
    unselectItemSteam(this);
  }); 
  setPrice("#selected_price", 0); summaSteamInv = 0;
  updateSelectAllSteamButton();
}

function selectSiteInventoryAll(argument) { 
  unselectSiteInventoryAll();
  setPrice("#selected_price_site", 0); summaSiteInv = 0;
	$(".siteinventar .item:not(.active)").each(function(idnx){
		selectItemSite(this);
	}); 
  updateSelectAllSiteButton();
}

function unselectSiteInventoryAll(argument) { 
	$(".siteinventar .item.active").each(function(idnx){
		unselectItemSite(this);
	});
  setPrice("#selected_price_site", 0); summaSiteInv = 0;
  updateSelectAllSiteButton();
}

function withdraw(){
  var nowCost = getPrice("#inv_cost_site");
  var nowSel = getPrice("#selected_price_site");
	if (nowCost==0 || nowSel==0){
  	showNotification("No items selected");
	}else{
    $.ajax({
      type: "POST",
      url: "apps.php",
      data: {
        action : 'withdraw'
      },
      success: function(response) {
        showNotification(response);
      }
    });
	}
}
function setupDeposit(){
	if(my_trade==""){showNotification("Please set your trade url!");return;}

  var depItems = [];
  var nowCost = getPrice("#inv_cost");
  var nowSel = getPrice("#selected_price");

  if($(".inventar .item.active").length == 0 || minSumBet > nowSel){
    showNotification("You bet less than minimum!");
    return;
  }

  $(".inventar .item.active").each(function(indx){
    depItems.push($(this).attr("data-xi"));
    nowCost -= parseFloat($(this).find("label").text());
    $(this).remove();
  });

  setPrice("#inv_cost", nowCost);
  setPrice("#selected_price", 0); summaSteamInv = 0;

  socket.emit("initDeposit", [iid, depItems]);
  showGoodNotification("Bot sent offer! Accept and confirm offer in steam. After that, your bet will appear in the list.");
}
function setupSiteDeposit(){
	if(my_trade==""){showNotification("Please set your trade url!");return;}

  var depItems = [];
  var nowCost = getPrice("#inv_cost_site");
  var nowSel = getPrice("#selected_price_site");

  if($(".siteinventar .item.active").length == 0 || minSumBet > nowSel){
    showNotification("You bet less than minimum!");
    return;
  }
  $(".siteinventar .item.active").each(function(indx){
    depItems.push($(this).attr("data-xi"));
    nowCost -= parseFloat($(this).find("label").text());
    $(this).remove();
  });

  setPrice("#inv_cost_site", nowCost);
  setPrice("#selected_price_site", 0); summaSiteInv = 0;

  socket.emit("initSiteDeposit", {'steamid':iid,'items':depItems});
  showNotification("Bot sent offer! Accept and confirm offer in steam. After that, your bet will appear in the list.")
}

function sortSteamInventory(orderMin) {
	isSortSteamInvMin = orderMin;
  let sortFunc = isSortSteamInvMin ? sortMin : sortMax;
  my_inventory.sort(function (a, b) {
    return sortFunc(a[2], b[2]);
  });

  setPrice("#selected_price", 0); summaSteamInv = 0;
  createSteamInventoryItems();
}

function createSteamInventoryItems()
{
  $(".inventar").empty();

  my_inventory.forEach(function(item){

    let itemHtml = createSteamInventoryItem(item[0], item[1], item[2]);
    $(".inventar").append(itemHtml);
  });
  bindTooltipsSteamInv();
}

function sortSiteInventoryMinMax()
{
  sortSiteInventory(!isSortSiteInvMin);
}

function sortSiteInventory(orderMin) {
	isSortSiteInvMin = orderMin;
	$.ajax({
		type: "POST",
		url: "apps.php",
    data: {
      action: 'getinv'
    },
		success: function(inv) {
      site_inventory = JSON.parse(inv);
      
      sortSiteInventoryHelp(isSortSiteInvMin);
		}
	});
}

function sortSiteInventoryHelp(orderMin) {
  setPrice("#selected_price_site", 0); summaSiteInv = 0;
  
  let sortFunc = orderMin ? sortMin : sortMax;
  site_inventory.sort(function (a, b) {
    return sortFunc(a.price, b.price);
  });

  createSiteInventoryItems();
}

function createSiteInventoryItems()
{
  $(".siteinventar").empty();
  site_inventory.forEach(function(item){
    let itemHtml = createSiteInventoryItem(item._id.$oid, item.steamid, item.market_hash_name, item.image, item.price);
    $(".siteinventar").append(itemHtml);
  });
  bindTooltipsSiteInv();
}

jQuery.fn.random = function() {var t = Math.floor(Math.random() * this.length);return jQuery(this[t])};
var socket = null, LAST_SCROLL_POS = 0;
var current_game_items = [];

var my_inventory = [];
var site_inventory = [];

var isSortSteamInvMin = false;
var isSortSiteInvMin = false;



$(function() {

	$(".dial").knob({
        min: 0,
        max: 90,
        readOnly: true,
        fgColor: "#ebcd36",
        width: 256,
        height: 256,
        thickness: .05,
        format: function(t) {
            return (Number($("#jackpot_info").data("worth")).toFixed(2) + " $");
        },
        draw: function() {
            $(".dial").css("font-size", "32px", "font-family", "'Roboto B'").css("width", "142px");
        }
    }),
    $("#toggleSounds") && hasSoundsEnabled() && $("#toggleSounds").attr("checked", !0), 
    $("#toggleSounds").on("change", function(t) {
        hasSoundsEnabled() ? localStorage.setItem("muteSounds", !0) : localStorage.removeItem("muteSounds")
    }), 
    $("[data-action=closeWhiteBox]").on("click", function(t) {
        t.preventDefault(), $(this).parent().parent().parent().fadeOut(250, function() {$(this).destroy()})
        }), 
    $("[data-action=reloadInventory]").on("click", function(t) {reloadInventory()}), 
    $("#changeTradeLink").on("click", function(t) {
        t.preventDefault(), $("#setTradeLink").fadeToggle()
    }), 
    $("a.depositNow").on("click", function(t) {
        t.preventDefault(), $depositDiv = $(".content.deposit").parent(), $("body").animate({
            scrollTop: $depositDiv.offset().top - $depositDiv.outerHeight()
        }, 500), $depositDiv.animateHighlight("#d6f0fd", 1500)
    }), 
    $(".raffle .participate").on("click", function(t) {
        if (t.preventDefault(), !$("body").data("user")) return void(window.location = "/auth/steam");
        var e = "Entering this raffle is completely free.<br>In order for us to afford creating these free raffles, we expect some advertisment in return.";
        e += "<br><br>If you would like to participate, please put <strong>"+siteDomain+"</strong> into your steam name.", e += '<br><br>After you have added it, click on "Continue" to proceed.';
        var o = showPopup("Step 1: Have "+siteDomain+" in your steam name!", e, [{"class": "accept",text: 'I have "'+siteDomain+'" my name. Continue.'}, {"class": "cancel",text: "Cancel"}]);
        o.find(".buttons > div").on("click", function(t) {var e = $(this).index();return 1 == e ? closePopup() : void($(this).hasClass("disabled") || ($(this).addClass("disabled"), socket.emit("sendRaffleNameCheck")))})
    });
	
/********************************************************************************************************************************/
  socket = io(sck_url, {secure: true});
    
	var check_current_state = false;
  var is_socket_connected = false;
    
    
  socket.on('connect', function(){
		console.log('CONNECT');
		/*if(check_current_state){
			clearInterval(check_current_state);
			check_current_state = false;
		}*/
  });
  
  if (location.pathname!="/" && location.pathname!=""){return}
    socket.on('informers', function(data){
			if(data.inf1) $('#usersConnected').html(data.inf1.toFixed());
			if(data.inf3) $('.Total_24hr span').html(data.inf3.toFixed());
 			if(data.inf4) $('.Biggest_Pot span').html(data.inf4.toFixed());
			if(data.inf7) $('.Games_24hr span').html(data.inf7.toFixed());
		});
    
    socket.on('last-winner', function(data){
      var htmlwin="";
      data.list.forEach(function(iWinner, index){
        htmlwin+=`<div class="winner"><div class="winner_pic"><img onerror="imgError(this);" src="${imgF(iWinner.ava)}"></div><div class="winner_info"><a target="_blank" class="profile">${iWinner.name}</a><br><small>won round #${iWinner.round} with <strong>${iWinner.items.length} items</strong>, had a winning chance of <strong>${Number(iWinner.chance).toFixed(1)}%</strong>.</small></div><div class="win_items">`;
        for(var i=0; i<(iWinner.items.length>=4 ? 4 : iWinner.items.length); i++) {
          htmlwin+='<img class="tooltip-winner" title="'+iWinner.items[i].itemname+" "+fPrice(1,iWinner.items[i].price)+' $" onerror="imgError(this);" src="'+iWinner.items[i].image+'">';
        }
        htmlwin+=`<div class="more"> + ? more.. </div></div><div class="win_details"><label>${iWinner.money.toFixed(2)} $</label></div><div class="clear"></div></div>`;
      });

      $(".winnerlist").fadeOut(150, function() {
        $(this).html(htmlwin).fadeIn(150);
        bindTooltipsWinnersInv();
      });
      $(".winnerlist").attr("data-num", data.list[0].round);
    });

    socket.on("timer", function(t) {
        $("#jackpot_info").data("cd", t);
        if (t == 0){
          $("#timer").html('0');
        } else {
          $(".countdown").html("Drawing winner in " + t + " seconds")
        }
        $("#timer").html(t);
        $(".dial").val(t).trigger("change");
    });

    socket.on("showWinnerTradeInfo", function(t) {
      if(t.steamid==iid){
        if(t.sentOfferId==0) {
          showConfirmNotification("ERROR"); $('#more_cat').remove();
        } else { showWinnerPopup(t) }
      }
    }); 

    socket.on("showPopup", function(t) {
        var e = showPopup(t.title, t.content, [{
            "class": "cancel",
            text: "Close"
        }]);
        e.find(".buttons > div").on("click", closePopup)
    }); 

    socket.on('playersUnique', function(data){
			var $cont = $("#participant_list").simplebar("getContentElement");
			$cont.empty();
			
			$.each(data.order, function(i,itemOrder){
        let skinText = data.list[itemOrder.steamid].count == 1 ? "skin" : "skins"
				var row = '<div class="user" data-steamid="'+itemOrder.steamid+'" data-chance="' + data.list[itemOrder.steamid].chance.toFixed(2) + '"><div class="profile_pic"><img onerror="imgError(this);" src="' + imgF(data.list[itemOrder.steamid].ava) + '"></div><div class="user_info"><a target="_blank" class="userlink">' + data.list[itemOrder.steamid].user + '</a><br><small>' + data.list[itemOrder.steamid].count + ' '+ skinText +' - <strong>' + data.list[itemOrder.steamid].money.toFixed(2) + ' $</strong></small></div><div class="percentage">' + data.list[itemOrder.steamid].chance.toFixed(1) + '%</div><div class="clear"></div></div>';
        $cont.append(row);
				if (mgx==9){copyWinButtons(itemOrder.steamid);}
			});
		});

    socket.on("loadInventory", function(sdata) {

      isSteamInventoryLoading = false;
      stopImgRotation("#reload-steam-inv-button .rotatable-img");
      if(sdata=='empty'){
        return showNotification("Warning: Your inventory is empty!")
      } else if(sdata=='wait'){
        return showNotification("Warning: Please wait, your inventory in processing!")
      } else if(!sdata){
        return showNotification("Warning: There was a problem loading your inventory...")
      }
      console.log(sdata);
      var suminv = 0;
      my_inventory = sdata;

      sortSteamInventory(isSortSteamInvMin);

      my_inventory.forEach(function(item) {
        suminv += parseFloat(fPrice(0,item[2]));       
      });

      setPrice("#inv_cost", suminv);
    });

    socket.on("loadSiteInventory", function(sdata) {
      stopImgRotation("#reload-site-inv-button .rotatable-img");
      isSiteInventoryLoading = false;

      if(sdata=='empty'){
        //return showNotification("Warning: Your inventory is empty!")
      } else if(sdata=='wait'){
        return showNotification("Warning: Please wait, your sit inventory in processing!")
      } else if(!sdata){
        return showNotification("Warning: There was a problem loading your site inventory...")
      }
			$.ajax({
				type: "POST",
				url: "apps.php",
        data: {
          action: 'getinv'
        },
				success: function(axx) {
		      site_inventory = JSON.parse(axx);

          sortSiteInventoryHelp(isSortSiteInvMin);

		      var suminv = 0;
		      site_inventory.forEach(function(item){
		        suminv += parseFloat(fPrice(0,item.price));
		      });

		      setPrice("#inv_cost_site", suminv);
				}
			});
    });

    socket.on('0', function(data){
     
      current_game_items = data.items.concat(current_game_items);
      current_game_items.sort(function(a, b) {
        return a.price - b.price;
        //return (fPrice(0,a.price) >= fPrice(0,b.price)) ? 1 : -1;
      });

      $('#item_list').simplebar("getContentElement").empty();
      for(var i=0; i<current_game_items.length; i++){
        $('#item_list').simplebar("getContentElement").prepend('<div class="item has-tooltip" data-owner="'+current_game_items[i].steamid+'"><div class="item_pic"><img onerror="imgError(this);" src="'+current_game_items[i].image+'"></div><div class="item_info"><small><strong>'+fPrice(1,current_game_items[i].price)+' $</strong></small><label>'+current_game_items[i].itemname+'</label></div><div class="clear"></div></div>');
      }
      $('title').text(data.items[data.items.length-1].jackpot.toFixed(0) + '$ - '+ siteDomain);
      $("#jackpot_info").data("worth", (data.items[data.items.length-1].jackpot).toFixed(2)).data("count", data.allcount); 
      $(".dial").numerator({
        toValue: $("#jackpot_info").data("worth"),
        rounding: 2,
        duration: 1000
      });
      $("#game_pot").text("GAME #"+data.num);
      $(".circle_info").html(data.allcount  + (1 == data.allcount ? " item" : " items"));

      bindTooltipsItems();
    });

    
    socket.on('chat', function (data) {
      var e = $(".chat .messagelist");
      LAST_SCROLL_POS = e.simplebar("getScrollElement").scrollTop();
      data.forEach(function(msg){
        var nkx=">";
        if(typeof msg.z!="undefined"){
          if(msg.z==2){nkx=" style='color:#bcff05'>"}
          if(mgx==9){
            if(msg.z==1){nkx=" style='color:#00e5ff'>"}
            else if(msg.z==3){nkx=" style='color:#ff0000'>"}
          }
        }
        e.simplebar("getContentElement").append('<div class="chatmsg" data-id="'+msg.id+'"><div class="profile_pic"><a target="_blank" ref="//steamcommunity.com/profiles/'+msg.id+'"><img onerror="imgError(this);" src="' + imgF(msg.ava) + '"></a></div><div class="boxmsg"><label'+nkx+'<a target="_blank" ref="//steamcommunity.com/profiles/'+msg.id+'">'+msg.name+'</a></label><div class="msg">' + msg.text + '</div></div><div class="clear"></div></div>');
        if (mgx==9){mxc();}
      });
      scrollChatToBottom(!1);
    });
    
    socket.on('dcxy', function (data) {
      $('.chatmsg[data-id="'+data+'"]').remove();
    });

    socket.on("end-game", function(t) {
      console.log(t);
        showWinnerUI(t);
        $('title').text(siteDomain);
        $(".dial").numerator({
          toValue: 0,
          rounding: 2,
          duration: 1000
        });
        $(".circle_info").html("0 items");
        $("#participant_list").simplebar("getContentElement").empty();
        $('#item_list').simplebar("getContentElement").empty();
          current_game_items = [];
    });
    
    socket.on("noty", function(t) {
        showNotification(t);
    });
    socket.on("imsg", function(t) {
      if(iid!="" && (t.id+"") == (iid+"")){
        if(typeof t.at !== "undefined"){
          $("#urlAcceptTrade").attr("href", "https://steamcommunity.com/tradeoffer/"+t.at);
          PopUpShow();
        } else {
          if(t.ia){showConfirmNotification(t.text)}else{showPersonalNotification(t.text)}
        }
      }
    });
    socket.on("thold", function(t) {
      console.info('trade hold', t, iid);
      if(iid!="" && (t.id+"") == (iid+"")){
        HoldPopUpShow();
      }
    });
    
    socket.on('qtrade', function(data) {
      	if (typeof notyfs['a']=="undefined"){
          notyfs['a']=1;setTimeout(function(){delete notyfs['a'];},3000);
          if (data.c==0){
            showNotification("Please wait, your deposit is being processed!");
          } else if(data.c==1){
            showNotification("You are won!","Please, wait trade offer!")
          } else if(data.c==2){
            reloadInventory();
          }
        }
    });
    
    socket.on('errtrade', function (data) {
      if (typeof notyfs['c'+data.c]=="undefined") {
        notyfs['c'+data.c] = 1;
        setTimeout(function(){delete notyfs['c'+data.c];},3000);
        switch (data.c) {
        case 1:
          showNotification('Warning: your trade has greater then Max items count!');
          break
        case 2:
          showNotification('Warning: your trade is cancel. You need connect Steam Guard on you Steam account.');
          break
        case 3:
          showNotification('Warning: error in checking Escrow status. Try again.');
          break
        case 4:
          showNotification('Warning: Please set your trade url!');
          break
        case 5:
          showNotification('Warning: Error... Try again.');
          break
        case 6:
          showNotification('Warning: Your bet is less than the minimum!');
          break
        case 7:
          showNotification('Warning: When sending a trade an error occurred, if you did not receive the items, please report it in support with the game number and the link reference.');
        case 8:
          showNotification('Warning: price for one item less than the minimum!');
          break
        case 9:
          TradeCancelModalShow();
          break
        default:
          break;
        }
      }
    });

    $("#submitChatMessage").on("submit", function(t) {
        t.preventDefault();
        let messageText = $(this).find("input[type=text]").val();
        if(!messageText)
        {
          console.log("message is empty!");
          return;
        }
        socket.emit('chat',{'msg':messageText,'name':MyName,'id':iid,'ava':MyAvatar});
        $(this).find("input[type=text]").val("").attr("disabled", !0), 
        scrollChatToBottom(!0), 
        setTimeout(function() {
          $("#submitChatMessage input[type=text]").removeAttr("disabled").focus()
        }, 500);
    });
        
    socket.emit('0');
    socket.emit('vi',iid);
  

    function reloadInventory() {

      if(isSteamInventoryLoading)
        return;

      startImgRotation("#reload-steam-inv-button .rotatable-img");
      isSteamInventoryLoading = true;
      $(".inventar").empty();
      unselectSteamInventoryAll();
      setPrice("#selected_price", 0); summaSteamInv = 0;
      setTimeout(function() {
        socket.emit('ReloadInventory',iid);
      }, 300);
    }
    window.reloadInventory = reloadInventory;
    function reloadSiteInventory() {
      if(isSiteInventoryLoading)
        return;

      isSiteInventoryLoading = true;
      startImgRotation("#reload-site-inv-button .rotatable-img");
      $(".siteinventar").empty();
      unselectSiteInventoryAll();
      setPrice("#selected_price_site", 0); summaSiteInv = 0;

      setTimeout(function() {
        socket.emit('ReloadSiteInventory',iid);
      }, 300);

    
    }
    window.reloadSiteInventory = reloadSiteInventory;

    if(iid!==''){reloadInventory();reloadSiteInventory();}

    socket.on("closepopup", closePopup);
    setTimeout(function() {
        scrollChatToBottom(!0);
    }, 0);
    $(".simplebar").simplebar();
  });

//});
var notLocked = !0;
$.fn.animateHighlight = function(t, e) {
    var o = t || "#FFFF9C",
        n = e || 1500,
        i = this.css("backgroundColor");
    notLocked && (notLocked = !1, this.stop().css("background-color", o).animate({
        backgroundColor: i
    }, n), setTimeout(function() {
        notLocked = !0
    }, n))
};

function createSteamInventoryItem(itemName, image, price)
{
  return '<div class="item" data-xi="'+itemName+'" onclick="selectItemSteam(this)"><div class="item_pic"><img class="tooltip-steam-inv" title="'+ itemName + '" onerror="imgError(this);" src="'+image+'"></div><div class="item_info"><label>'+fPrice(1,price)+' $</label></div><div class="clear"></div></div>'
}

function createSiteInventoryItem(id, steamid, itemName, image, price)
{
  return '<div class="item" onclick="selectItemSite(this)" data-xid="'+id+'" data-owner="'+steamid+'"><div class="item_pic"><img class="tooltip-site-inv" title="'+ itemName + '" onerror="imgError(this);" src="'+image+'"></div><div class="item_info"><label>'+fPrice(1,price)+' $</label></div><div class="clear"></div></div>';
}

function sortMax(elem1, elem2)
{
  if (elem1 <= elem2) {
    return 1;
  } else {
    return -1;
  }
}

function sortMin(elem1, elem2)
{
  if (elem1 >= elem2) {
    return 1;
  } else {
    return -1;
  }
}

function stopImgRotation(path)
{
  $(path).removeClass("rotate");
}

function startImgRotation(path)
{
  $(path).addClass("rotate");
}