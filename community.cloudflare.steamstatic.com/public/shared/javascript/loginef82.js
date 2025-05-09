"use strict";

function CLoginPromptManager( strBaseURL, rgOptions )
{
	// normalize with trailing slash
	this.m_strBaseURL = strBaseURL + ( strBaseURL.substr(-1) == '/' ? '' : '/' ) + ( this.m_bIsMobile ? 'mobilelogin' : 'login' ) + '/';
	this.m_strSiteBaseURL = strBaseURL; // Actual base url, not the login base url above.

	// read options
	rgOptions = rgOptions || {};
	this.m_bIsMobile = rgOptions.bIsMobile || false;
	this.m_strMobileClientType = rgOptions.strMobileClientType || '';
	this.m_strMobileClientVersion = rgOptions.strMobileClientVersion || '';
	this.m_bIsMobileSteamClient = ( this.m_strMobileClientType ? true : false );
	this.m_bMobileClientSupportsPostMessage = rgOptions.bMobileClientSupportsPostMessage || false;

	this.m_$LogonForm = $JFromIDOrElement( rgOptions.elLogonForm || document.forms['logon'] );

	this.m_fnOnFailure = rgOptions.fnOnFailure || null;
	this.m_fnOnSuccess = rgOptions.fnOnSuccess || null;

	this.m_strRedirectURL = rgOptions.strRedirectURL || (this.m_bIsMobile ? '' : strBaseURL);
	this.m_strSessionID = rgOptions.strSessionID || null;

	this.m_strUsernameEntered = null;
	this.m_strUsernameCanonical = null;

	if ( rgOptions.gidCaptcha )
		this.UpdateCaptcha( rgOptions.gidCaptcha );
	else
		this.RefreshCaptcha();	// check if needed
	

	this.m_bLoginInFlight = false;
	this.m_bInEmailAuthProcess = false;
	this.m_bInTwoFactorAuthProcess = false;
	this.m_TwoFactorModal = null;
	this.m_bEmailAuthSuccessful = false;
	this.m_bLoginTransferInProgress = false;
	this.m_bEmailAuthSuccessfulWantToLeave = false;
	this.m_bTwoFactorAuthSuccessful = false;
	this.m_bTwoFactorAuthSuccessfulWantToLeave = false;
	this.m_sOAuthRedirectURI = 'steammobile://mobileloginsucceeded';
	this.m_sAuthCode = "";
	this.m_sPhoneNumberLastDigits = "??";
	this.m_bTwoFactorReset = false;

	// values we collect from the user
	this.m_steamidEmailAuth = '';


	// record keeping
	this.m_iIncorrectLoginFailures = 0;	// mobile reveals password after a couple failures

	var _this = this;

	this.m_$LogonForm.submit( function(e) {
		_this.DoLogin();
		e.preventDefault();
	});
	// find buttons and make them clickable
	$J('#login_btn_signin' ).children('a, button' ).click( function() { _this.DoLogin(); } );

	this.InitModalContent();

	// these modals need to be in the body because we refer to elements by name before they are ready
	this.m_$ModalAuthCode = this.GetModalContent( 'loginAuthCodeModal' );
	this.m_$ModalAuthCode.find('[data-modalstate]' ).each( function() {
		$J(this).click( function() { _this.SetEmailAuthModalState( $J(this).data('modalstate') ); } );
	});
	this.m_$ModalAuthCode.find('form').submit( function(e) {
		_this.SetEmailAuthModalState('submit');
		e.preventDefault();
	});
	this.m_EmailAuthModal = null;

	this.m_$ModalIPT = this.GetModalContent( 'loginIPTModal' );

	this.m_$ModalTwoFactor = this.GetModalContent( 'loginTwoFactorCodeModal' );
	this.m_$ModalTwoFactor.find( '[data-modalstate]' ).each( function() {
		$J(this).click( function() { _this.SetTwoFactorAuthModalState( $J(this).data('modalstate') ); } );
	});
	this.m_$ModalTwoFactor.find( 'form' ).submit( function(e) {
		// Prevent submit if nothing was entered
		if ( $J('#twofactorcode_entry').val() != '' )
		{
			// Push the left button
			var $btnLeft = _this.m_$ModalTwoFactor.find( '.auth_buttonset:visible .auth_button.leftbtn ' );
			$btnLeft.trigger( 'click' );
		}

		e.preventDefault();
	});



	// register to listen to IOS two factor callback
	$J(document).on('SteamMobile_ReceiveAuthCode', function( e, authcode ) {
		_this.m_sAuthCode = authcode;
	});

	$J('#captchaRefreshLink' ).click( $J.proxy( this.RefreshCaptcha, this ) );

	// include some additional scripts we may need
	if ( typeof BigNumber == 'undefined' )
		$J.ajax( { url: 'https://community.cloudflare.steamstatic.com/public/shared/javascript/crypto/jsbn.js', type: 'get', dataType: 'script', cache: true } );
	if ( typeof RSA == 'undefined' )
		$J.ajax( { url: 'https://community.cloudflare.steamstatic.com/public/shared/javascript/crypto/rsa.js', type: 'get', dataType: 'script', cache: true } );
}

CLoginPromptManager.prototype.BIsIos = function() { return this.m_strMobileClientType == 'ios'; };
CLoginPromptManager.prototype.BIsAndroid = function() { return this.m_strMobileClientType == 'android'; };
CLoginPromptManager.prototype.BIsWinRT = function() { return this.m_strMobileClientType == 'winrt'; };

CLoginPromptManager.prototype.BIsUserInMobileClientVersionOrNewer = function( nMinMajor, nMinMinor, nMinPatch ) {
	if ( (!this.BIsIos() && !this.BIsAndroid() && !this.BIsWinRT() ) || this.m_strMobileClientVersion == '' )
		return false;

	var version = this.m_strMobileClientVersion.match( /(?:(\d+) )?\(?(\d+)\.(\d+)(?:\.(\d+))?\)?/ );
	if ( version && version.length >= 3 )
	{
		var nMajor = parseInt( version[2] );
		var nMinor = parseInt( version[3] );
		var nPatch = parseInt( version[4] );

		return nMajor > nMinMajor || ( nMajor == nMinMajor && ( nMinor > nMinMinor || ( nMinor == nMinMinor && nPatch >= nMinPatch ) ) );
	}
};

CLoginPromptManager.prototype.GetParameters = function( rgParams )
{
	var rgDefaultParams = { 'donotcache': new Date().getTime() };
	if ( this.m_strSessionID )
		rgDefaultParams['sessionid'] = this.m_strSessionID;

	return $J.extend( rgDefaultParams, rgParams );
};

CLoginPromptManager.prototype.$LogonFormElement = function( strElementName )
{
	var $Form = this.m_$LogonForm;
	var elInput = this.m_$LogonForm[0].elements[ strElementName ];

	if ( !elInput )
	{
		var $Input = $J('<input/>', {type: 'hidden', name: strElementName } );
		$Form.append( $Input );
		return $Input;
	}
	else
	{
		return $J( elInput );
	}
};

CLoginPromptManager.prototype.HighlightFailure = function( msg )
{
	if ( this.m_fnOnFailure )
	{
		this.m_fnOnFailure( msg );

		// always blur on mobile so the error can be seen
		if ( this.m_bIsMobile && msg )
			$J('input:focus').blur();
	}
	else
	{
		var $ErrorElement = $J('#error_display');

		if ( msg )
		{
			$ErrorElement.text( msg );
			$ErrorElement.slideDown();

			if ( this.m_bIsMobile )
				$J('input:focus').blur();
		}
		else
		{
			$ErrorElement.hide();
		}
	}
};


//Refresh the catpcha image
CLoginPromptManager.prototype.RefreshCaptcha = function()
{
	var _this = this;
	$J.post( this.m_strBaseURL + 'refreshcaptcha/', this.GetParameters( {} ) )
		.done( function( data ) {
			_this.UpdateCaptcha( data.gid );
		});
};

CLoginPromptManager.prototype.UpdateCaptcha = function( gid )
{
	if ( gid != -1 )
	{
		$J('#captcha_entry').show();

		var $ImageElement = $J('#captchaImg');

		var strURL = this.m_strBaseURL + 'rendercaptcha/?gid=' + gid;

		if ( $ImageElement.data( 'noborder' ) )
		{
			strURL += '&noborder=1';
		}

		$ImageElement.attr( 'src', strURL );
		this.$LogonFormElement('captcha_text').val('');
	}
	else
	{
		$J('#captcha_entry' ).hide();
	}
	this.m_gidCaptcha = gid;
};

CLoginPromptManager.prototype.DoLogin = function()
{
	var form = this.m_$LogonForm[0];

	var username = form.elements['username'].value;
	this.m_strUsernameEntered = username;
	username = username.replace( /[^\x00-\x7F]/g, '' ); // remove non-standard-ASCII characters
	this.m_strUsernameCanonical = username;

	var password = form.elements['password'].value;
	password = password.replace( /[^\x00-\x7F]/g, '' ); // remove non-standard-ASCII characters

	if ( this.m_bLoginInFlight || password.length == 0 || username.length == 0 )
		return;

	this.m_bLoginInFlight = true;
	$J('#login_btn_signin').hide();
	$J('#login_btn_wait').show();

	// reset some state
	this.HighlightFailure( '' );

	var _this = this;
	$J.post( this.m_strBaseURL + 'getrsakey/', this.GetParameters( { username: username } ) )
		.done( $J.proxy( this.OnRSAKeyResponse, this ) )
		.fail( function () {
			ShowAlertDialog( '錯誤', '與 Steam 伺服器連線時發生問題，請稍後再試。' );
			$J('#login_btn_signin').show();
			$J('#login_btn_wait').hide();
			_this.m_bLoginInFlight = false;
		});
};

// used to get mobile client to execute a steammobile URL
CLoginPromptManager.prototype.RunLocalURL = function(url)
{
	var $IFrame = $J('<iframe/>', {src: url} );
	$J(document.body).append( $IFrame );

	// take it back out immediately
	$IFrame.remove();
};

var g_interval = null;

// read results from Android or WinRT clients
CLoginPromptManager.prototype.GetValueFromLocalURL = function( url, callback )
{
	window.g_status = null;
	window.g_data = null;
	this.RunLocalURL( url );

	var timeoutTime = Date.now() + 1000 * 5;

	if ( g_interval != null )
	{
		window.clearInterval( g_interval );
		g_interval = null;
	}

	// poll regularly (but gently) for an update.
	g_interval = window.setInterval( function() {
		var status = window.SGHandler.getResultStatus();
		if ( status && status != 'busy' )
		{
			if ( g_interval )
				window.clearInterval( g_interval );

			var value = window.SGHandler.getResultValue();
			callback( [ status, value ] );
			return;
		}
		if ( Date.now() > timeoutTime )
		{
			if ( g_interval )
				window.clearInterval( g_interval );
			callback( ['error', 'timeout'] );
			return;
		}
	}, 100);
};

// this function is invoked by iOS after the steammobile:// url is triggered by GetAuthCode.
//	we post an event to the dom to let any login handlers deal with it.
function receiveAuthCode( code )
{
	$J(document).trigger( 'SteamMobile_ReceiveAuthCode', [ code ] );
};

CLoginPromptManager.prototype.GetAuthCode = function( results, callback )
{
	if ( this.m_bIsMobile )
	{
		//	honor manual entry before anything else
		var code = $J('#twofactorcode_entry').val();
		if ( code.length > 0 )
		{
			callback( results, code );
			return;
		}

		if ( this.BIsIos() )
		{
			this.m_sAuthCode = '';
			this.RunLocalURL( "steammobile://twofactorcode?gid=" + results.token_gid );

			// this is expected to trigger receiveAuthCode and we'll have this value set by the time it's done
			if ( this.m_sAuthCode.length > 0 )
			{
				callback( results, this.m_sAuthCode );
				return;
			}
		}
		else if ( this.BIsAndroid() || this.BIsWinRT() )
		{
			var result = this.GetValueFromLocalURL('steammobile://twofactorcode?gid=' + results.token_gid, function(result) {
				if ( result[0] == 'ok' )
				{
					callback(results, result[1]);
				} else {
					// this may be in the modal
					callback(results, $J('#twofactorcode_entry').val());
				}
			});
			return;
		}

		// this may be in the modal
		callback(results, $J('#twofactorcode_entry').val());
	}
	else
	{
		var authCode = this.m_sAuthCode;
		this.m_sAuthCode = '';
		callback( results, authCode );
	}
};


CLoginPromptManager.prototype.OnRSAKeyResponse = function( results )
{
	if ( results.publickey_mod && results.publickey_exp && results.timestamp )
	{
		this.GetAuthCode( results , $J.proxy(this.OnAuthCodeResponse, this) );
	}
	else
	{
		if ( results.message )
		{
			ShowAlertDialog( '錯誤', results.message );
		}
		else
		{
			ShowAlertDialog( '錯誤', '與 Steam 伺服器連線時發生問題，請稍後再試。' );
		}

		$J('#login_btn_signin').show();
		$J('#login_btn_wait').hide();

		this.m_bLoginInFlight = false;
	}
};

CLoginPromptManager.prototype.OnAuthCodeResponse = function( results, authCode )
{
	var form = this.m_$LogonForm[0];
	var pubKey = RSA.getPublicKey(results.publickey_mod, results.publickey_exp);
	var username = this.m_strUsernameCanonical;
	var password = form.elements['password'].value;
	password = password.replace(/[^\x00-\x7F]/g, ''); // remove non-standard-ASCII characters
	var encryptedPassword = RSA.encrypt(password, pubKey);

	var rgParameters = {
		password: encryptedPassword,
		username: username,
		twofactorcode: authCode,
		emailauth: form.elements['emailauth'] ? form.elements['emailauth'].value : '',
		loginfriendlyname: form.elements['loginfriendlyname'] ? form.elements['loginfriendlyname'].value : '',
		captchagid: this.m_gidCaptcha,
		captcha_text: form.elements['captcha_text'] ? form.elements['captcha_text'].value : '',
		emailsteamid: this.m_steamidEmailAuth,
		rsatimestamp: results.timestamp,
		remember_login: ( form.elements['remember_login'] && form.elements['remember_login'].checked ) ? 'true' : 'false'
			};

	if (this.m_bIsMobile)
		rgParameters.oauth_client_id = form.elements['oauth_client_id'].value;

	var _this = this;
	$J.post(this.m_strBaseURL + 'dologin/', this.GetParameters(rgParameters))
		.done($J.proxy(this.OnLoginResponse, this))
		.fail(function () {
			ShowAlertDialog('錯誤', '與 Steam 伺服器連線時發生問題，請稍後再試。' );

			$J('#login_btn_signin').show();
			$J('#login_btn_wait').hide();
			_this.m_bLoginInFlight = false;
		});
};


CLoginPromptManager.prototype.OnLoginResponse = function( results )
{
	this.m_bLoginInFlight = false;
	var bRetry = true;

	if ( results.login_complete )
	{
		if ( this.m_bIsMobile && results.oauth )
		{
			if( results.redirect_uri )
			{
				// Special case dota dev universe work
				if ( results.redirect_uri.startsWith( "http://www.dota2.com" ) )
				{
									}

				this.m_sOAuthRedirectURI = results.redirect_uri;
			}

			this.$LogonFormElement('oauth' ).val( results.oauth );
			bRetry = false;
			this.LoginComplete();
			return;
		}

		var bRunningTransfer = false;
		if ( ( results.transfer_url || results.transfer_urls ) && results.transfer_parameters )
		{
			bRunningTransfer = true;
			var _this = this;
			if ( !this.m_bLoginTransferInProgress )
				CLoginPromptManager.TransferLogin( results.transfer_urls || [ results.transfer_url ], results.transfer_parameters, function() { _this.OnTransferComplete(); } );
			this.m_bLoginTransferInProgress = true;
		}

		if ( this.m_bInEmailAuthProcess )
		{
			this.m_bEmailAuthSuccessful = true;
			this.SetEmailAuthModalState( 'success' );
		}
		else if ( this.m_bInTwoFactorAuthProcess )
		{
			this.m_bTwoFactorAuthSuccessful = true;
			this.SetTwoFactorAuthModalState( 'success' );
		}
		else
		{
			bRetry = false;
			if ( !bRunningTransfer )
				this.LoginComplete();
		}
	}
	else
	{
		// if there was some kind of other error while doing email auth or twofactor, make sure
		//	the modals don't get stuck
		if ( !results.emailauth_needed && this.m_EmailAuthModal )
			this.m_EmailAuthModal.Dismiss();

		if ( !results.requires_twofactor && this.m_TwoFactorModal )
			this.m_TwoFactorModal.Dismiss();

		if ( results.requires_twofactor )
		{
			$J('#captcha_entry').hide();

			if ( !this.m_bInTwoFactorAuthProcess )
				this.StartTwoFactorAuthProcess();
			else
				this.SetTwoFactorAuthModalState( 'incorrectcode' );
		}
		else if ( results.captcha_needed && results.captcha_gid )
		{
			this.UpdateCaptcha( results.captcha_gid );
			this.m_iIncorrectLoginFailures ++;
		}
		else if ( results.emailauth_needed )
		{
			if ( results.emaildomain )
				$J('#emailauth_entercode_emaildomain').text( results.emaildomain );

			if ( results.emailsteamid )
				this.m_steamidEmailAuth = results.emailsteamid;

			if ( !this.m_bInEmailAuthProcess )
				this.StartEmailAuthProcess();
			else
				this.SetEmailAuthModalState( 'incorrectcode' );
		}
		else if ( results.denied_ipt )
		{
			ShowDialog( 'Intel® 身分辨識保護技術', this.m_$ModalIPT.show() ).always( $J.proxy( this.ClearLoginForm, this ) );
		}
		else if ( results.agreement_session_url )
		{
			window.location = results.agreement_session_url + '&redir=' + this.m_strBaseURL;
		}
		else
		{
			this.m_strUsernameEntered = null;
			this.m_strUsernameCanonical = null;
			this.m_iIncorrectLoginFailures ++;
		}

		if ( results.message )
		{
			this.HighlightFailure( results.message );
			if ( this.m_bIsMobile && this.m_iIncorrectLoginFailures > 1 && !results.emailauth_needed && !results.bad_captcha )
			{
				// 2 failed logins not due to Steamguard or captcha, un-obfuscate the password field
				$J( '#passwordclearlabel' ).show();
				$J( '#steamPassword' ).val('');
				$J( '#steamPassword' ).attr( 'type', 'text' );
				$J( '#steamPassword' ).attr( 'autocomplete', 'off' );
			}
			else if ( results.clear_password_field )
			{
				$J( '#input_password' ).val('');
				$J( '#input_password' ).focus();
			}

		}
	}
	if ( bRetry )
	{
		$J('#login_btn_signin').show();
		$J('#login_btn_wait').hide();
	}
};

CLoginPromptManager.prototype.ClearLoginForm = function()
{
	var rgElements = this.m_$LogonForm[0].elements;
	rgElements['username'].value = '';
	rgElements['password'].value = '';
	if ( rgElements['emailauth'] ) rgElements['emailauth'].value = '';
	this.m_steamidEmailAuth = '';

	// part of the email auth modal
	$J('#authcode').value = '';

	if ( this.m_gidCaptcha )
		this.RefreshCaptcha();

	rgElements['username'].focus();
};

CLoginPromptManager.prototype.StartEmailAuthProcess = function()
{
	this.m_bInEmailAuthProcess = true;

	this.SetEmailAuthModalState( 'entercode' );

	var _this = this;
	this.m_EmailAuthModal = ShowDialog( 'Steam Guard', this.m_$ModalAuthCode.show() )
		.always( function() {
			$J(document.body).append( _this.m_$ModalAuthCode.hide() );
			_this.CancelEmailAuthProcess();
			_this.m_EmailAuthModal = null;
		} );

	this.m_EmailAuthModal.SetDismissOnBackgroundClick( false );
	this.m_EmailAuthModal.SetRemoveContentOnDismissal( false );
	$J('#authcode_entry').find('input').focus();
};

CLoginPromptManager.prototype.CancelEmailAuthProcess = function()
{
	this.m_steamidEmailAuth = '';
	if ( this.m_bInEmailAuthProcess )
	{
		this.m_bInEmailAuthProcess = false;

		// if the user closed the auth window on the last step, just redirect them like we normally would
		if ( this.m_bEmailAuthSuccessful )
			this.LoginComplete();
	}
};

CLoginPromptManager.TransferLogin = function( rgURLs, parameters, fnOnComplete )
{
	var bOnCompleteFired = false;
	var fnFireOnComplete = function( bSuccess )
	{
		if ( !bOnCompleteFired )
			fnOnComplete( bSuccess );
		bOnCompleteFired = true;
	}

	var cResponsesExpected = rgURLs.length;
	$J(window).on( 'message', function() {
		if ( --cResponsesExpected == 0 )
			fnFireOnComplete( true );
	});

	for ( var i = 0 ; i < rgURLs.length; i++ )
	{
		var $IFrame = $J('<iframe>', {id: 'transfer_iframe' } ).hide();
		$J(document.body).append( $IFrame );

		var doc = $IFrame[0].contentWindow.document;
		doc.open();
		doc.write( '<form method="POST" action="' + rgURLs[i] + '" name="transfer_form">' );
		for ( var param in parameters )
		{
			doc.write( '<input type="hidden" name="' + param + '" value="' + V_EscapeHTML( parameters[param] ) + '">' );
		}
		doc.write( '</form>' );
		doc.write( '<script>window.onload = function(){ document.forms["transfer_form"].submit(); }</script>' );
		doc.close();
	}

	// after 10 seconds, give up on waiting for transfer
	window.setTimeout( function() { fnFireOnComplete( false ); }, 10000 );
};

CLoginPromptManager.prototype.OnTransferComplete = function()
{
	if ( !this.m_bLoginTransferInProgress )
		return;
	this.m_bLoginTransferInProgress = false;
	if ( !this.m_bInEmailAuthProcess && !this.m_bInTwoFactorAuthProcess )
		this.LoginComplete();
	else if ( this.m_bEmailAuthSuccessfulWantToLeave || this.m_bTwoFactorAuthSuccessfulWantToLeave)
		this.LoginComplete();
};

CLoginPromptManager.prototype.OnEmailAuthSuccessContinue = function()
{
		$J('#auth_buttonsets').children().hide();
	$J('#auth_buttonset_waiting').show();

	if ( this.m_bLoginTransferInProgress )
	{
		this.m_bEmailAuthSuccessfulWantToLeave = true;
	}
	else
		this.LoginComplete();
};

CLoginPromptManager.prototype.LoginComplete = function()
{
	if ( this.m_fnOnSuccess )
	{
		this.m_fnOnSuccess();
	}
	else if ( $J('#openidForm').length )
	{
				$J('#openidForm').submit();
	}
	else if ( this.m_strRedirectURL != '' )
	{
		// If this isn't one of our URLs, reject anything that looks like it has a protocol in it.
		if ( this.m_strRedirectURL.match ( /^[^\/]*:/i ) )
		{
			if ( this.m_strRedirectURL.replace( /^http:/, 'https:' ).indexOf( this.m_strSiteBaseURL.replace( /^http:/, 'https:') ) !== 0 )
			{
				this.m_strRedirectURL = '';
			}
		}
		// browsers treat multiple leading slashes as the end of the protocol specifier
		if ( this.m_strRedirectURL.match( /^\/\// ) ) { this.m_strRedirectURL = ''; }
		if( this.m_strRedirectURL  )
			window.location = this.m_strRedirectURL;
		else
			window.location = this.m_strSiteBaseURL
	}
	else if ( this.m_bIsMobile )
	{
				var oauthJSON = document.forms['logon'].elements['oauth'] && document.forms['logon'].elements['oauth'].value;
		if ( oauthJSON && ( oauthJSON.length > 0 ) )
		{
			if ( this.m_bMobileClientSupportsPostMessage )
			{
								var strHost = window.location.protocol + '//' + window.location.host;
				window.postMessage( oauthJSON, strHost );
			}
			else
			{
				window.location = this.m_sOAuthRedirectURI + '?' + oauthJSON;
			}
		}
	}
};

CLoginPromptManager.prototype.SubmitAuthCode = function()
{
	if ( !v_trim( $J('#authcode').val() ).length )
		return;

	$J('#auth_details_computer_name').css('color', '85847f' );	//TODO
	$J('#auth_buttonsets').children().hide();
	$J('#auth_buttonset_waiting').show();

	this.$LogonFormElement( 'loginfriendlyname' ).val( $J('#friendlyname').val() );
	this.$LogonFormElement( 'emailauth' ).val( $J('#authcode').val() );

	this.DoLogin();
};

CLoginPromptManager.prototype.SetEmailAuthModalState = function( step )
{
	if ( step == 'submit' )
	{
		this.SubmitAuthCode();
		return;
	}
	else if ( step == 'complete' )
	{
		this.OnEmailAuthSuccessContinue();
		return;
	}

	$J('#auth_messages').children().hide();
	$J('#auth_message_' + step ).show();

	$J('#auth_details_messages').children().hide();
	$J('#auth_details_' + step ).show();

	$J('#auth_buttonsets').children().hide();
	$J('#auth_buttonset_' + step ).show();

	$J('#authcode_help_supportlink').hide();

	var icon='key';
	var bShowAuthcodeEntry = true;
	if ( step == 'entercode' )
	{
		icon = 'mail';
	}
	else if ( step == 'checkspam' )
	{
		icon = 'trash';
	}
	else if ( step == 'success' )
	{
		icon = 'unlock';
		bShowAuthcodeEntry = false;
		$J('#success_continue_btn').focus();
		this.m_EmailAuthModal.SetDismissOnBackgroundClick( true );
		this.m_EmailAuthModal.always( $J.proxy( this.LoginComplete, this ) );
	}
	else if ( step == 'incorrectcode' )
	{
		icon = 'lock';
	}
	else if ( step == 'help' )
	{
		icon = 'steam';
		bShowAuthcodeEntry = false;
		$J('#authcode_help_supportlink').show();
	}

	if ( bShowAuthcodeEntry )
	{
		var $AuthcodeEntry = $J('#authcode_entry');
		if ( !$AuthcodeEntry.is(':visible') )
		{
			$AuthcodeEntry.show().find('input').focus();
		}
		$J('#auth_details_computer_name').show();
	}
	else
	{
		$J('#authcode_entry').hide();
		$J('#auth_details_computer_name').hide();
	}

	$J('#auth_icon').attr('class', 'auth_icon auth_icon_' + icon );
};

CLoginPromptManager.prototype.StartTwoFactorAuthProcess = function()
{
	this.m_bInTwoFactorAuthProcess = true;
	this.SetTwoFactorAuthModalState( 'entercode' );

	var _this = this;
	this.m_TwoFactorModal = ShowDialog( 'Steam Guard 行動驗證', this.m_$ModalTwoFactor.show() )
		.fail( function() { _this.CancelTwoFactorAuthProcess(); } )
		.always( function() {
			$J(document.body).append( _this.m_$ModalTwoFactor.hide() );
			_this.m_bInTwoFactorAuthProcess = false;
			_this.m_TwoFactorModal = null;
		} );
	this.m_TwoFactorModal.SetMaxWidth( 400 );
	this.m_TwoFactorModal.SetDismissOnBackgroundClick( false );
	this.m_TwoFactorModal.SetRemoveContentOnDismissal( false );

	$J('#twofactorcode_entry').focus();
};


CLoginPromptManager.prototype.CancelTwoFactorAuthProcess = function()
{
	this.m_bInTwoFactorAuthProcess = false;

	if ( this.m_bTwoFactorAuthSuccessful )
		this.LoginComplete();
	else
		this.ClearLoginForm();
};


CLoginPromptManager.prototype.OnTwoFactorResetOptionsResponse = function( results )
{
	if ( results.success && results.options.sms.allowed )
	{
		this.m_sPhoneNumberLastDigits = results.options.sms.last_digits;
		this.SetTwoFactorAuthModalState( 'selfhelp_sms_remove' ); // Or reset if this.m_bTwoFactorReset
	}
	else if ( results.success )
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_nosms' );
	}
	else
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_failure' );
		$J( '#login_twofactorauth_details_selfhelp_failure' ).text( results.message );
	}
};


CLoginPromptManager.prototype.OnTwoFactorRecoveryFailure = function()
{
	this.SetTwoFactorAuthModalState( 'selfhelp_failure' );
	$J( '#login_twofactorauth_details_selfhelp_failure' ).text( '' ); // v0v
};


CLoginPromptManager.prototype.OnStartRemoveTwoFactorResponse = function( results )
{
	if ( results.success )
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_sms_remove_entercode' );
	}
	else
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_failure' );
		$J( '#login_twofactorauth_details_selfhelp_failure' ).text( results.message );
	}
};


CLoginPromptManager.prototype.OnRemoveTwoFactorResponse = function( results )
{
	if ( results.success )
	{
		if ( this.m_bTwoFactorReset )
		{
			if ( this.m_bIsMobileSteamClient && !this.m_bMobileClientSupportsPostMessage )
				this.RunLocalURL( "steammobile://steamguard?op=setsecret&arg1=" + results.replacement_token );

			this.SetTwoFactorAuthModalState( 'selfhelp_twofactor_replaced' );
		}
		else
		{
			this.SetTwoFactorAuthModalState( 'selfhelp_twofactor_removed' );
		}
	}
	else if ( results.retry )
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_sms_remove_incorrectcode' );
	}
	else
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_failure' );
		$J( '#login_twofactorauth_details_selfhelp_failure' ).text( results.message );
	}
};


CLoginPromptManager.prototype.OnUseTwoFactorRecoveryCodeResponse = function( results )
{
	if ( results.success )
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_twofactor_removed' );
	}
	else if ( results.retry )
	{
		$J( '#login_twofactorauth_details_selfhelp_rcode_incorrectcode' ).text( results.message );
		this.SetTwoFactorAuthModalState( 'selfhelp_rcode_incorrectcode' );
	}
	else if ( results.exhausted )
	{
		$J( '#login_twofactorauth_details_selfhelp_rcode_incorrectcode_exhausted' ).text( results.message );
		this.SetTwoFactorAuthModalState( 'selfhelp_rcode_incorrectcode_exhausted' );
	}
	else
	{
		this.SetTwoFactorAuthModalState( 'selfhelp_failure' );
		$J( '#login_twofactorauth_details_selfhelp_failure' ).text( results.message );
	}
};


CLoginPromptManager.prototype.OnTwoFactorAuthSuccessContinue = function()
{
	if ( !this.m_bIsMobile )
	{
		$J('#login_twofactorauth_buttonsets').children().hide();
		$J('#login_twofactorauth_buttonset_waiting').show();
	}

	if ( this.m_bLoginTransferInProgress )
	{
		this.m_bTwoFactorAuthSuccessfulWantToLeave = true;
	}
	else
	{
		this.LoginComplete();
	}
};

CLoginPromptManager.prototype.SetTwoFactorAuthModalState = function( step )
{
	if ( step == 'submit' )
	{
		$J('#login_twofactor_authcode_entry').hide();
		this.SubmitTwoFactorCode();
		return;
	}
	else if ( step == 'success' )
	{
		this.OnTwoFactorAuthSuccessContinue();
		return;
	}

	$J('#login_twofactorauth_messages').children().hide();
	$J('#login_twofactorauth_message_' + step ).show();

	$J('#login_twofactorauth_details_messages').children().hide();
	$J('#login_twofactorauth_details_' + step ).show();

	$J('#login_twofactorauth_buttonsets').children().hide();
	$J('#login_twofactorauth_buttonset_' + step ).show();

	$J('#login_twofactor_authcode_help_supportlink').hide();

	var icon = 'key';
	if ( step == 'entercode' )
	{
		icon = 'phone';
		$J('#login_twofactor_authcode_entry').show();
		$J('#twofactorcode_entry').val('');
		$J('#login_twofactorauth_message_entercode_accountname').text( this.m_strUsernameEntered );
		$J('#twofactorcode_entry').focus();
	}
	else if ( step == 'incorrectcode' )
	{
		icon = 'lock';
		$J('#login_twofactor_authcode_entry').show();
		$J('#twofactorcode_entry').val('');
		$J('#twofactorcode_entry').focus();
	}
	else if ( step == 'selfhelp' )
	{
		icon = 'steam';
		$J('#login_twofactor_authcode_entry').hide();

		if ( !this.m_bIsMobileSteamClient
				|| this.BIsAndroid() && !this.BIsUserInMobileClientVersionOrNewer( 2, 0, 32 )
				|| this.BIsIos() && !this.BIsUserInMobileClientVersionOrNewer( 2, 0, 0 )
				// no version minimum for Windows phones
			)
		{
			$J( '#login_twofactorauth_buttonset_selfhelp div[data-modalstate=selfhelp_sms_reset_start]' ).hide();
		}
	}
	else if ( step == 'selfhelp_sms_remove_start' || step == 'selfhelp_sms_reset_start' )
	{
		icon = 'steam';
		$J('#login_twofactor_authcode_entry').hide();

		$J('#login_twofactorauth_messages').children().hide();
		$J('#login_twofactorauth_details_messages').children().hide();

		$J('#login_twofactorauth_buttonsets').children().hide();
		$J('#login_twofactorauth_buttonset_waiting').show();

		this.m_bTwoFactorReset = (step == 'selfhelp_sms_reset_start');

		$J.post( this.m_strBaseURL + 'getresetoptions/', this.GetParameters( {} ) )
				.done( $J.proxy( this.OnTwoFactorResetOptionsResponse, this ) )
				.fail( $J.proxy( this.OnTwoFactorRecoveryFailure, this ) );
	}
	else if ( step == 'selfhelp_sms_remove' )
	{
		icon = 'steam';
		$J('#login_twofactorauth_selfhelp_sms_remove_last_digits').text( this.m_sPhoneNumberLastDigits );
	}
	else if ( step == 'selfhelp_sms_remove_sendcode' )
	{
		icon = 'steam';
		$J('#login_twofactor_authcode_entry').hide();

		$J('#login_twofactorauth_messages').children().hide();
		$J('#login_twofactorauth_details_messages').children().hide();

		$J('#login_twofactorauth_buttonsets').children().hide();
		$J('#login_twofactorauth_buttonset_waiting').show();

		$J.post( this.m_strBaseURL + 'startremovetwofactor/', this.GetParameters( {} ) )
				.done( $J.proxy( this.OnStartRemoveTwoFactorResponse, this ) )
				.fail( $J.proxy( this.OnTwoFactorRecoveryFailure, this ) );
	}
	else if ( step == 'selfhelp_sms_remove_entercode' )
	{
		$J('#login_twofactorauth_selfhelp_sms_remove_entercode_last_digits').text( this.m_sPhoneNumberLastDigits );

		$J('#login_twofactor_authcode_entry').show();
		$J('#twofactorcode_entry').val('');
		$J('#twofactorcode_entry').focus();
	}
	else if ( step == 'selfhelp_sms_remove_checkcode' )
	{
		$J('#login_twofactor_authcode_entry').hide();

		$J('#login_twofactorauth_messages').children().hide();
		$J('#login_twofactorauth_details_messages').children().hide();

		$J('#login_twofactorauth_buttonsets').children().hide();
		$J('#login_twofactorauth_buttonset_waiting').show();

		// Immediately skip to incorrect code step without actually checking it if the user forgot to enter a code.
		if ( $J('#twofactorcode_entry').val().length == 0 )
		{
			this.SetTwoFactorAuthModalState( 'selfhelp_sms_remove_incorrectcode' );
		}
		else
		{
			var rgParameters = {
				smscode: $J( '#twofactorcode_entry' ).val(),
				reset: this.m_bTwoFactorReset ? 1 : 0
			};

			$J.post( this.m_strBaseURL + 'removetwofactor/', this.GetParameters( rgParameters ) )
					.done( $J.proxy( this.OnRemoveTwoFactorResponse, this ) )
					.fail( $J.proxy( this.OnTwoFactorRecoveryFailure, this ) );
		}
	}
	else if ( step == 'selfhelp_sms_remove_incorrectcode' )
	{
		icon = 'lock';
		$J('#login_twofactor_authcode_entry').show();
		$J('#twofactorcode_entry').focus();
	}
	else if ( step == 'selfhelp_twofactor_removed' )
	{
		icon = 'unlock';
		$J('#twofactorcode_entry').val(''); // Make sure the next login doesn't supply a code
	}
	else if ( step == 'selfhelp_twofactor_replaced' )
	{
		icon = 'steam';
		$J('#twofactorcode_entry').val('');
	}
	else if ( step == 'selfhelp_sms_remove_complete' )
	{
		this.m_TwoFactorModal.Dismiss();
		this.m_bInTwoFactorAuthProcess = false;
		this.DoLogin();
	}
	else if ( step == 'selfhelp_nosms' )
	{
		icon = 'steam';
		$J('#login_twofactor_authcode_entry').hide();
	}
	else if ( step == 'selfhelp_rcode' )
	{
		$J('#login_twofactor_authcode_entry').show();
		$J('#twofactorcode_entry').val('');
		$J('#twofactorcode_entry').focus();
	}
	else if ( step == 'selfhelp_rcode_checkcode' )
	{
		$J('#login_twofactor_authcode_entry').hide();

		$J('#login_twofactorauth_messages').children().hide();
		$J('#login_twofactorauth_details_messages').children().hide();

		$J('#login_twofactorauth_buttonsets').children().hide();
		$J('#login_twofactorauth_buttonset_waiting').show();

		// Immediately skip to incorrect code step without actually checking it if the user forgot to enter a code.
		if ( $J('#twofactorcode_entry').val().length == 0 )
		{
			this.SetTwoFactorAuthModalState( 'selfhelp_rcode_incorrectcode' );
		}
		else
		{
			var rgParameters = { rcode: $J( '#twofactorcode_entry' ).val() };

			$J.post( this.m_strBaseURL + 'userecoverycode/', this.GetParameters( rgParameters ) )
					.done( $J.proxy( this.OnUseTwoFactorRecoveryCodeResponse, this ) )
					.fail( $J.proxy( this.OnTwoFactorRecoveryFailure, this ) );
		}
	}
	else if ( step == 'selfhelp_rcode_incorrectcode' )
	{
		icon = 'lock';
		$J('#login_twofactor_authcode_entry').show();
		$J('#twofactorcode_entry').focus();
	}
	else if ( step == 'selfhelp_couldnthelp' )
	{
		icon = 'steam';
		$J('#login_twofactor_authcode_entry').hide();
	}
	else if ( step == 'help' )
	{
		icon = 'steam';
		$J('#login_twofactor_authcode_entry').hide();
		$J('#login_twofactor_authcode_help_supportlink').show();
	}
	else if ( step == 'selfhelp_failure' )
	{
		icon = 'steam';
	}

	if ( this.m_bInTwoFactorAuthProcess && this.m_TwoFactorModal )
	{
		this.m_TwoFactorModal.AdjustSizing();
	}

	$J('#login_twofactorauth_icon').attr( 'class', 'auth_icon auth_icon_' + icon );
};

CLoginPromptManager.prototype.SubmitTwoFactorCode = function()
{
	this.m_sAuthCode = $J('#twofactorcode_entry').val();


	$J('#login_twofactorauth_messages').children().hide();
	$J('#login_twofactorauth_details_messages').children().hide();

	$J('#login_twofactorauth_buttonsets').children().hide();
	$J('#login_twofactorauth_buttonset_waiting').show();

	this.DoLogin();
};

CLoginPromptManager.sm_$Modals = null;	// static
CLoginPromptManager.prototype.InitModalContent = function()
{
	
	var $modals = $J('#loginModals');
	if ( $modals.length == 0 )
	{
		// This does not work on Android 2.3, nor does creating the DOM node and
		// setting innerHTML without jQuery. So on the mobile login page, we put
		// the modals into the page directly, but not all pages have that.
		CLoginPromptManager.sm_$Modals = $J( "<div id=\"loginModals\">\n\t<div class=\"login_modal loginAuthCodeModal\" style=\"display: none\">\n\t\t<form data-ajax=\"false\">\n\t\t\t<div class=\"auth_message_area\">\n\t\t\t\t<div id=\"auth_icon\" class=\"auth_icon auth_icon_key\">\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_messages\" id=\"auth_messages\">\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_entercode\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">\u60a8\u597d\uff01<\/div>\n\t\t\t\t\t\t<p>\u6211\u5011\u767c\u73fe\u60a8\u6b63\u5728\u5f9e\u65b0\u7684\u700f\u89bd\u5668\u6216\u96fb\u8166\u767b\u5165 Steam\uff0c\u6216\u662f\u5df2\u7d93\u4e00\u6bb5\u6642\u9593\u6c92\u767b\u5165\u4e86\u2026<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_checkspam\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">\u8aa4\u8a8d\u70ba\u5783\u573e\u90f5\u4ef6\uff1f<\/div>\n\t\t\t\t\t\t<p>\u60a8\u770b\u904e\u5783\u573e\u90f5\u4ef6\u5323\u4e86\u55ce\uff1f\u5982\u679c\u60a8\u5728\u6536\u4ef6\u5323\u4e2d\u6c92\u6709\u770b\u5230\u4f86\u81ea Steam \u5ba2\u670d\u7684\u8a0a\u606f\uff0c\u8acb\u8a66\u8457\u53bb\u90a3\u908a\u627e\u627e\u770b\u3002<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_success\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">\u6210\u529f\uff01<\/div>\n\t\t\t\t\t\t<p>\u60a8\u73fe\u5728\u53ef\u4ee5\u5f9e\u9019\u88e1\u5b58\u53d6\u60a8\u7684 Steam \u5e33\u6236\u3002<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">\u54ce\u5466\uff01<\/div>\n\t\t\t\t\t\t<p>\u62b1\u6b49\uff0c<br>\u60a8\u8f38\u5165\u7684\u9a57\u8b49\u78bc\u4e0d\u6b63\u78ba\u2026<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_help\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">\u8b93\u6211\u5011\u4f86\u5e6b\u60a8\u5427\uff01<\/div>\n\t\t\t\t\t\t<p>\u5c0d\u60a8\u906d\u9047\u554f\u984c\u4e00\u4e8b\uff0c\u6211\u5011\u6df1\u611f\u62b1\u6b49\u3002\u6211\u5011\u77e5\u9053\u60a8\u7684 Steam \u5e33\u6236\u5c0d\u60a8\u4f86\u8aaa\u975e\u5e38\u91cd\u8981\uff0c\u4e5f\u627f\u8afe\u6703\u76e1\u529b\u5354\u52a9\u60a8\u907f\u514d\u5e33\u6236\u906d\u975e\u6cd5\u76dc\u7528\u3002<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div id=\"auth_details_messages\" class=\"auth_details_messages\">\n\t\t\t\t<div class=\"auth_details\" id=\"auth_details_entercode\" style=\"display: none;\">\n\t\t\t\t\t\u4f5c\u70ba\u984d\u5916\u7684\u5e33\u6236\u5b89\u5168\u63aa\u65bd\uff0c\u60a8\u5fc5\u9808\u8f38\u5165\u6211\u5011\u525b\u525b\u50b3\u9001\u81f3\u60a8\u7684\u96fb\u5b50\u4fe1\u7bb1\uff08<span id=\"emailauth_entercode_emaildomain\"><\/span>\uff09\u7684\u7279\u6b8a\u4ee3\u78bc\u4f86\u6388\u6b0a\u6b64\u700f\u89bd\u5668\u767b\u5165\u3002\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_details\" id=\"auth_details_success\" style=\"display: none;\">\n\t\t\t\t\t\u5982\u679c\u9019\u662f\u516c\u5171\u96fb\u8166\uff0c\u8acb\u8a18\u5f97\u5728\u96e2\u958b\u6b64\u700f\u89bd\u5668\u6642\u767b\u51fa Steam\u3002\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_details\" id=\"auth_details_help\" style=\"display: none;\">\n\t\t\t\t\t\u8acb\u806f\u7e6b Steam \u5ba2\u670d\u5c0b\u6c42\u5354\u52a9\u3002\u5354\u52a9\u6b63\u5e38\u767b\u5165\u5e33\u6236\u662f\u6211\u5011\u7684\u9996\u8981\u4efb\u52d9\u3002\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"authcode_entry_area\">\n\t\t\t\t<div id=\"authcode_entry\">\n\t\t\t\t\t<div class=\"authcode_entry_box\">\n\t\t\t\t\t\t<input class=\"authcode_entry_input authcode_placeholder\" id=\"authcode\" type=\"text\" value=\"\"\n\t\t\t\t\t\t\t   placeholder=\"\u8acb\u5728\u6b64\u8655\u8f38\u5165\u60a8\u7684\u4ee3\u78bc\">\n\n\t\t\t\t\t<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div id=\"authcode_help_supportlink\">\n\t\t\t\t\t<a href=\"https:\/\/help.steampowered.com\/zh-tw\/faqs\/view\/06B0-26E6-2CF8-254C\" data-ajax=\"false\" data-externallink=\"1\">\u8acb\u806f\u7d61 Steam \u5ba2\u670d\u4ee5\u7372\u53d6\u5e33\u6236\u5b58\u53d6\u5354\u52a9<\/a>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"modal_buttons\" id=\"auth_buttonsets\">\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_entercode\" style=\"display: none;\">\n\t\t\t\t\t<div data-modalstate=\"submit\" class=\"auth_button leftbtn\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">\u9001\u51fa<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u7684\u7279\u5225\u5b58\u53d6\u4ee3\u78bc<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div data-modalstate=\"checkspam\" class=\"auth_button\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">\u4ec0\u9ebc\u8a0a\u606f\uff1f<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u6c92\u6709\u6536\u5230\u4efb\u4f55\u4f86\u81ea Steam \u5ba2\u670d\u7684\u8a0a\u606f\u2026<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_checkspam\" style=\"display: none;\">\n\t\t\t\t\t<div data-modalstate=\"submit\" class=\"auth_button leftbtn\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">\u627e\u5230\u4e86\uff01<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">\u4e14\u6211\u5df2\u5728\u4e0a\u65b9\u8f38\u5165\u6211\u7684\u7279\u5225\u5b58\u53d6\u4ee3\u78bc<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div data-modalstate=\"help\"  class=\"auth_button\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">\u9084\u662f\u6c92\u6709\u2026<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u6c92\u6709\u6536\u5230\u4efb\u4f55\u4f86\u81ea Steam \u5ba2\u670d\u7684\u8a0a\u606f\u2026<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_success\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_button auth_button_spacer\">\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<a data-modalstate=\"complete\" class=\"auth_button\" id=\"success_continue_btn\" href=\"javascript:void(0);\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">\u524d\u5f80 Steam\uff01<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">&nbsp;<br>&nbsp;<\/div>\n\t\t\t\t\t<\/a>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div data-modalstate=\"submit\" class=\"auth_button leftbtn\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">\u6211\u60f3\u518d\u8a66\u4e00\u6b21<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">\u4e14\u6211\u5df2\u5728\u4e0a\u65b9\u91cd\u65b0\u8f38\u5165\u6211\u7684\u7279\u5225\u5b58\u53d6\u4ee3\u78bc<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div data-modalstate=\"help\" class=\"auth_button\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u60f3\u6211\u9700\u8981 Steam \u5ba2\u670d\u7684\u5354\u52a9\u2026<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_waiting\" style=\"display: none;\">\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div style=\"\" id=\"auth_details_computer_name\" class=\"auth_details_messages\">\n\t\t\t\t\u70ba\u4e86\u65b9\u4fbf\u5728\u5df2\u7372 Steam Guard \u6388\u6b0a\u7684\u88dd\u7f6e\u6e05\u55ae\u4e2d\u8fa8\u8b58\u6b64\u700f\u89bd\u5668\uff0c\u8acb\u8f38\u5165\u4e00\u500b\u5bb9\u6613\u8a18\u4f4f\u7684\u66b1\u7a31 - \u9577\u5ea6\u81f3\u5c11\u9700 6 \u500b\u5b57\u5143\u3002\t\t\t\t<div id=\"friendly_name_box\" class=\"friendly_name_box\">\n\t\t\t\t\t<input class=\"authcode_entry_input authcode_placeholder\" id=\"friendlyname\" type=\"text\"\n\t\t\t\t\t\t   placeholder=\"\u8acb\u8f38\u5165\u4e00\u500b\u597d\u8a18\u7684\u66b1\u7a31\">\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div style=\"display: none;\">\n\t\t\t\t<input type=\"submit\">\n\t\t\t<\/div>\n\t\t<\/form>\n\t<\/div>\n\n\t<div class=\"login_modal loginIPTModal\" style=\"display: none\">\n\t\t<div class=\"auth_message_area\">\n\t\t\t<div class=\"auth_icon ipt_icon\">\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_messages\">\n\t\t\t\t<div class=\"auth_message\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u62b1\u6b49<\/div>\n\t\t\t\t\t<p>\u6b64\u5e33\u6236\u5728\u6c92\u6709\u984d\u5916\u6388\u6b0a\u7684\u60c5\u6cc1\u4e0b\u7121\u6cd5\u5f9e\u6b64\u96fb\u8166\u5b58\u53d6\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"auth_details_messages\">\n\t\t\t<div class=\"auth_details\">\n\t\t\t\t\u8acb\u806f\u7e6b Steam \u5ba2\u670d\u5c0b\u6c42\u5354\u52a9\u3002\u5354\u52a9\u6b63\u5e38\u767b\u5165\u5e33\u6236\u662f\u6211\u5011\u7684\u9996\u8981\u4efb\u52d9\u3002\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"authcode_entry_area\">\n\t\t<\/div>\n\t\t<div class=\"modal_buttons\">\n\t\t\t<div class=\"auth_buttonset\" >\n\t\t\t\t<a href=\"https:\/\/help.steampowered.com\/\" class=\"auth_button leftbtn\" data-ajax=\"false\" data-externallink=\"1\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u6df1\u5165\u4e86\u89e3<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u95dc\u65bc Intel\u00ae \u8eab\u5206\u8fa8\u8b58\u4fdd\u8b77\u6280\u8853<\/div>\n\t\t\t\t<\/a>\n\t\t\t\t<a href=\"https:\/\/support.steampowered.com\" class=\"auth_button\" data-ajax=\"false\" data-externallink=\"1\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u60f3\u6211\u9700\u8981 Steam \u5ba2\u670d\u7684\u5354\u52a9\u2026<\/div>\n\t\t\t\t<\/a>\n\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t<\/div>\n\t\t<\/div>\n\t<\/div>\n\n\n\n\t<div class=\"login_modal loginTwoFactorCodeModal\" style=\"display: none;\">\n\t\t<form>\n\t\t<div class=\"twofactorauth_message_area\">\n\t\t\t<div id=\"login_twofactorauth_icon\" class=\"auth_icon auth_icon_key\">\n\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_messages\" id=\"login_twofactorauth_messages\">\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_entercode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\"><span id=\"login_twofactorauth_message_entercode_accountname\"><\/span> \u60a8\u597d\uff01<\/div>\n\t\t\t\t\t<p>\u6b64\u5e33\u6236\u76ee\u524d\u5df2\u555f\u7528 Steam Guard \u884c\u52d5\u9a57\u8b49\u5668\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u54ce\u5466\uff01<\/div>\n\t\t\t\t\t<p>\u62b1\u6b49\uff0c<br>\u60a8\u8f38\u5165\u7684\u9a57\u8b49\u78bc\u4e0d\u6b63\u78ba\u2026<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u8b93\u6211\u5011\u4f86\u5e6b\u60a8\u5427\uff01<\/div>\n\t\t\t\t\t<p>\u5c0d\u60a8\u906d\u9047\u554f\u984c\u4e00\u4e8b\uff0c\u6211\u5011\u6df1\u611f\u62b1\u6b49\u3002\u6211\u5011\u77e5\u9053\u60a8\u7684 Steam \u5e33\u6236\u5c0d\u60a8\u4f86\u8aaa\u975e\u5e38\u91cd\u8981\uff0c\u4e5f\u627f\u8afe\u6703\u76e1\u529b\u5354\u52a9\u60a8\u907f\u514d\u5e33\u6236\u906d\u975e\u6cd5\u76dc\u7528\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_sms_remove\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u78ba\u8a8d\u5e33\u6236\u6240\u6709\u6b0a<\/div>\n\t\t\t\t\t<p>\u6211\u5011\u6703\u767c\u9001\u4e00\u5247\u542b\u6709\u5e33\u6236\u6551\u63f4\u4ee3\u78bc\u7684\u7c21\u8a0a\u5230\u672b\u865f\u70ba <span id=\"login_twofactorauth_selfhelp_sms_remove_last_digits\"><\/span> \u7684\u624b\u6a5f\u865f\u78bc\u3002\u8f38\u5165\u6551\u63f4\u4ee3\u78bc\u5f8c\uff0c\u6211\u5011\u6703\u5f9e\u60a8\u7684\u5e33\u6236\u79fb\u9664\u884c\u52d5\u9a57\u8b49\u5668\uff0c\u60a8\u4e4b\u5f8c\u4fbf\u6703\u900f\u904e\u96fb\u5b50\u90f5\u4ef6\u7372\u53d6 Steam Guard \u4ee3\u78bc\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_sms_remove_entercode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u78ba\u8a8d\u5e33\u6236\u6240\u6709\u6b0a<\/div>\n\t\t\t\t\t<p>\u6211\u5011\u767c\u9001\u4e86\u4e00\u5247\u542b\u6709\u78ba\u8a8d\u4ee3\u78bc\u7684\u7c21\u8a0a\u5230\u672b\u865f\u70ba <span id=\"login_twofactorauth_selfhelp_sms_remove_entercode_last_digits\"><\/span> \u7684\u624b\u6a5f\u865f\u78bc\u3002\u8acb\u5728\u4e0b\u65b9\u8f38\u5165\u8a72\u4ee3\u78bc\u4ee5\u4fbf\u6211\u5011\u5f9e\u60a8\u7684\u5e33\u6236\u79fb\u9664\u884c\u52d5\u9a57\u8b49\u5668\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_sms_remove_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u54ce\u5466\uff01<\/div>\n\t\t\t\t\t<p>\u62b1\u6b49\uff0c<br>\u60a8\u8f38\u5165\u7684\u9a57\u8b49\u78bc\u4e0d\u6b63\u78ba\u2026<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_twofactor_removed\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u6210\u529f\uff01<\/div>\n\t\t\t\t\t<p>\u6211\u5011\u5df2\u7d93\u81ea\u60a8\u7684\u5e33\u6236\u79fb\u9664\u884c\u52d5\u9a57\u8b49\u5668\u3002\u4e0b\u6b21\u767b\u5165\u6642\uff0c\u60a8\u5fc5\u9808\u8f38\u5165\u6211\u5011\u767c\u9001\u5230\u60a8\u96fb\u5b50\u4fe1\u7bb1\u7684 Steam Guard \u4ee3\u78bc\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_twofactor_replaced\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u6210\u529f\uff01<\/div>\n\t\t\t\t\t<p>\u60a8\u73fe\u5728\u53ef\u4ee5\u4f7f\u7528\u6b64\u88dd\u7f6e\u4f86\u7372\u53d6\u5e33\u6236\u7684\u884c\u52d5\u9a57\u8b49\u5668\u4ee3\u78bc\u4e86\u3002\u6240\u6709\u5176\u4ed6\u60a8\u66fe\u4f7f\u7528\u904e\u7684\u88dd\u7f6e\u5c07\u505c\u6b62\u986f\u793a\u9a57\u8b49\u5668\u4ee3\u78bc\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_nosms\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u60a8\u6709\u6551\u63f4\u4ee3\u78bc\u55ce\uff1f<\/div>\n\t\t\t\t\t<p>\u60a8\u7684 Steam \u5e33\u6236\u5c1a\u672a\u767b\u8a18\u624b\u6a5f\u865f\u78bc\uff0c\u56e0\u6b64\u6211\u5011\u7121\u6cd5\u900f\u904e\u7c21\u8a0a\u9a57\u8b49\u60a8\u7684\u8eab\u5206\u3002\u60a8\u624b\u908a\u662f\u5426\u6709\u7576\u521d\u65b0\u589e\u884c\u52d5\u9a57\u8b49\u5668\u6642\u6536\u5230\u7684\u6551\u63f4\u4ee3\u78bc\uff1f\u6551\u63f4\u4ee3\u78bc\u7684\u958b\u982d\u70ba\u82f1\u6587\u5b57\u6bcd\u300cR\u300d\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u8f38\u5165\u60a8\u7684\u6551\u63f4\u4ee3\u78bc<\/div>\n\t\t\t\t\t<p>\u8acb\u5728\u4e0b\u65b9\u7684\u6846\u6846\u5167\u8f38\u5165\u60a8\u7684\u6551\u63f4\u4ee3\u78bc\u3002\u6551\u63f4\u4ee3\u78bc\u7684\u958b\u982d\u70ba\u82f1\u6587\u5b57\u6bcd\u300cR\u300d\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u54ce\u5466\uff01<\/div>\n\t\t\t\t\t<p>\u62b1\u6b49\uff0c<br>\u60a8\u8f38\u5165\u7684\u9a57\u8b49\u78bc\u4e0d\u6b63\u78ba\u2026<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode_incorrectcode_exhausted\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u54ce\u5466\uff01<\/div>\n\t\t\t\t\t<p>\u62b1\u6b49\uff0c<br>\u60a8\u8f38\u5165\u7684\u9a57\u8b49\u78bc\u4e0d\u6b63\u78ba\u2026<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode_message\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u54ce\u5466\uff01<\/div>\n\t\t\t\t\t<p>\u62b1\u6b49\uff0c<br>\u60a8\u8f38\u5165\u7684\u9a57\u8b49\u78bc\u4e0d\u6b63\u78ba\u2026<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_couldnthelp\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u8b93\u6211\u5011\u4f86\u5e6b\u60a8\u5427\uff01<\/div>\n\t\t\t\t\t<p>\u5982\u679c\u60a8\u7121\u6cd5\u4f7f\u7528\u884c\u52d5\u88dd\u7f6e\u3001\u5e33\u6236\u4e0a\u767b\u8a18\u7684\u624b\u6a5f\u865f\u78bc\uff0c\u6216\u6c92\u6709\u4fdd\u5b58\u65b0\u589e\u884c\u52d5\u9a57\u8b49\u5668\u6642\u6536\u5230\u7684\u6551\u63f4\u4ee3\u78bc\uff0c\u8acb\u806f\u7d61 Steam \u5ba2\u670d\u5354\u52a9\u60a8\u53d6\u56de\u5e33\u6236\u4f7f\u7528\u6b0a\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_help\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u8b93\u6211\u5011\u4f86\u5e6b\u60a8\u5427\uff01<\/div>\n\t\t\t\t\t<p>\u5c0d\u60a8\u906d\u9047\u554f\u984c\u4e00\u4e8b\uff0c\u6211\u5011\u6df1\u611f\u62b1\u6b49\u3002\u6211\u5011\u77e5\u9053\u60a8\u7684 Steam \u5e33\u6236\u5c0d\u60a8\u4f86\u8aaa\u975e\u5e38\u91cd\u8981\uff0c\u4e5f\u627f\u8afe\u6703\u76e1\u529b\u5354\u52a9\u60a8\u907f\u514d\u5e33\u6236\u906d\u975e\u6cd5\u76dc\u7528\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_failure\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">\u62b1\u6b49\uff01<\/div>\n\t\t\t\t\t<p>\u8655\u7406\u60a8\u7684\u8acb\u6c42\u6642\u767c\u751f\u932f\u8aa4\u3002<\/p>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div id=\"login_twofactorauth_details_messages\" class=\"twofactorauth_details_messages\">\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_entercode\" style=\"display: none;\">\n\t\t\t\t\u8f38\u5165 Steam \u884c\u52d5\u61c9\u7528\u7a0b\u5f0f\u76ee\u524d\u986f\u793a\u7684\u4ee3\u78bc\uff1a\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp\" style=\"display: none;\">\n\t\t\t\t\u82e5\u60a8\u907a\u5931\u4e86\u884c\u52d5\u88dd\u7f6e\uff0c\u6216\u79fb\u9664\u4e86\u884c\u52d5\u61c9\u7528\u7a0b\u5f0f\u800c\u7121\u6cd5\u53d6\u5f97\u9a57\u8b49\u78bc\uff0c\u60a8\u5373\u53ef\u81ea\u5e33\u6236\u4e2d\u79fb\u9664\u884c\u52d5\u9a57\u8b49\u5668\u3002\u7136\u800c\u9019\u9ebc\u505a\u6703\u964d\u4f4e\u5e33\u6236\u7684\u5b89\u5168\u6027\uff0c\u56e0\u6b64\u6211\u5011\u5efa\u8b70\u60a8\u5728\u53d6\u5f97\u65b0\u7684\u884c\u52d5\u88dd\u7f6e\u5f8c\uff0c\u518d\u6b21\u65b0\u589e\u884c\u52d5\u9a57\u8b49\u5668\u3002\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_help\" style=\"display: none;\">\n\t\t\t\t\u8acb\u806f\u7d61 Steam \u5ba2\u670d\u90e8\u9580\u5c0b\u6c42\u5354\u52a9\u3002\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp_failure\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp_rcode_incorrectcode\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp_rcode_incorrectcode_exhausted\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"twofactorauthcode_entry_area\">\n\t\t\t<div id=\"login_twofactor_authcode_entry\">\n\t\t\t\t<div class=\"twofactorauthcode_entry_box\">\n\t\t\t\t\t<input class=\"twofactorauthcode_entry_input authcode_placeholder\" id=\"twofactorcode_entry\" type=\"text\"\n\t\t\t\t\t\t   placeholder=\"\u8acb\u5728\u6b64\u8655\u8f38\u5165\u60a8\u7684\u4ee3\u78bc\" autocomplete=\"off\">\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div id=\"login_twofactor_authcode_help_supportlink\">\n\t\t\t\t<a href=\"https:\/\/help.steampowered.com\/zh-tw\/faqs\/view\/06B0-26E6-2CF8-254C\">\n\t\t\t\t\t\u806f\u7d61 Steam \u5ba2\u670d\u4ee5\u5354\u52a9\u5b58\u53d6\u5e33\u6236\t\t\t\t<\/a>\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"modal_buttons\" id=\"login_twofactorauth_buttonsets\">\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_entercode\" style=\"display: none;\">\n\t\t\t\t<div type=\"submit\" class=\"auth_button leftbtn\" data-modalstate=\"submit\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u9001\u51fa<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u7684\u9a57\u8b49\u5668\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u7121\u6cd5\u4f7f\u7528\u884c\u52d5\u9a57\u8b49\u5668\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_incorrectcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"submit\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u6211\u60f3\u518d\u8a66\u4e00\u6b21<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u4e14\u6211\u5df2\u5728\u4e0a\u65b9\u8f38\u5165\u6211\u7684\u9a57\u8b49\u5668\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u60f3\u6211\u9700\u8981 Steam \u5ba2\u670d\u7684\u5354\u52a9\u2026<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_start\">\n\t\t\t\t\t<div class=\"auth_button_h3\" style=\"font-size: 16px;\">\u79fb\u9664\u9a57\u8b49\u5668<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u4e26\u56de\u5fa9\u900f\u904e\u96fb\u5b50\u90f5\u4ef6\u7372\u53d6\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_sms_reset_start\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u4f7f\u7528\u6b64\u88dd\u7f6e<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u4e26\u900f\u904e\u6b64\u61c9\u7528\u7a0b\u5f0f\u7372\u53d6\u9a57\u8b49\u5668\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_sms_remove\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_sendcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u597d\uff01<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u767c\u7c21\u8a0a\u7d66\u6211<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_nosms\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u6211\u6c92\u8fa6\u6cd5<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u56e0\u70ba\u6211\u7121\u6cd5\u4f7f\u7528\u90a3\u652f\u624b\u6a5f\u865f\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_sms_remove_entercode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u9001\u51fa<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u5df2\u5728\u4e0a\u65b9\u8f38\u5165\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_nosms\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u672a\u6536\u5230\u7c21\u8a0a<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_sms_remove_incorrectcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u9001\u51fa<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u5df2\u7d93\u91cd\u65b0\u8f38\u5165\u4ee3\u78bc\u3002\u8acb\u518d\u8a66\u4e00\u6b21\u3002<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_nosms\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u672a\u6536\u5230\u7c21\u8a0a<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_twofactor_removed\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_complete\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u767b\u5165<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u79fb\u9664\u884c\u52d5\u9a57\u8b49\u5668<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_twofactor_replaced\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_complete\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u767b\u5165<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u5230 Steam \u884c\u52d5\u61c9\u7528\u7a0b\u5f0f<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_nosms\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_rcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u662f<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u6709\u5b57\u6bcd\u300cR\u300d\u958b\u982d\u7684\u6551\u63f4\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u5426<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u6c92\u6709\u90a3\u6a23\u7684\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_rcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_rcode_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u9001\u51fa<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u7684\u6551\u63f4\u4ee3\u78bc<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u60f3\u6211\u9700\u8981 Steam \u5ba2\u670d\u7684\u5354\u52a9\u2026<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_rcode_incorrectcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_rcode_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u9001\u51fa<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u5df2\u7d93\u91cd\u65b0\u8f38\u5165\u4ee3\u78bc\u3002\u8acb\u518d\u8a66\u4e00\u6b21\u3002<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u60f3\u6211\u9700\u8981 Steam \u5ba2\u670d\u7684\u5354\u52a9\u2026<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_rcode_incorrectcode_exhausted\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u8acb\u6c42\u5354\u52a9<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u6211\u60f3\u6211\u9700\u8981 Steam \u5ba2\u670d\u7684\u5354\u52a9\u2026<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_couldnthelp\" style=\"display: none;\">\n\t\t\t\t<a class=\"auth_button leftbtn\" href=\"https:\/\/help.steampowered.com\/\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u806f\u7d61\u6211\u5011<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u4ee5\u7372\u5f97\u5e33\u6236\u767b\u5165\u5354\u52a9<\/div>\n\t\t\t\t<\/a>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_waiting\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div style=\"display: none;\">\n\t\t\t<input type=\"submit\">\n\t\t<\/div>\n\t\t<\/form>\n\t<\/div>\n<\/div>\n" );
		$J('body').append( CLoginPromptManager.sm_$Modals );
	}
	else
	{
		CLoginPromptManager.sm_$Modals = $modals;
	}
};

CLoginPromptManager.prototype.GetModalContent = function( strModalType )
{
	var $ModalContent = CLoginPromptManager.sm_$Modals.find( '.login_modal.' + strModalType );

	if ( this.m_bIsMobileSteamClient )
	{
		var manager = this;
		$ModalContent.find('a[data-externallink]' ).each( function() {
			if ( !manager.m_bMobileClientSupportsPostMessage )
				$J(this).attr( 'href', 'steammobile://openexternalurl?url=' + $J(this).attr('href') );
			else
				$J(this).on('click', function( e ) {
					e.preventDefault();
					window.postMessage( JSON.stringify( {action: "openexternalurl", url: $J(this).attr('href') } ), window.location );
				});
		});
	}

	return $ModalContent;
};

