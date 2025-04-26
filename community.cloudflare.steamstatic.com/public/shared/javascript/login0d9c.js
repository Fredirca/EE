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
			ShowAlertDialog( 'Lỗi', 'Đã có vấn đề phát sinh trong quá trình giao tiếp với máy chủ Steam. Xin vui lòng thử lại sau.' );
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
			ShowAlertDialog( 'Lỗi', results.message );
		}
		else
		{
			ShowAlertDialog( 'Lỗi', 'Đã có vấn đề phát sinh trong quá trình giao tiếp với máy chủ Steam. Xin vui lòng thử lại sau.' );
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
			ShowAlertDialog('Lỗi', 'Đã có vấn đề phát sinh trong quá trình giao tiếp với máy chủ Steam. Xin vui lòng thử lại sau.' );

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
			ShowDialog( 'Công nghệ bảo vệ danh tính Intel®', this.m_$ModalIPT.show() ).always( $J.proxy( this.ClearLoginForm, this ) );
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
	this.m_TwoFactorModal = ShowDialog( 'Bộ xác thực Steam Guard di động', this.m_$ModalTwoFactor.show() )
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
		CLoginPromptManager.sm_$Modals = $J( "<div id=\"loginModals\">\n\t<div class=\"login_modal loginAuthCodeModal\" style=\"display: none\">\n\t\t<form data-ajax=\"false\">\n\t\t\t<div class=\"auth_message_area\">\n\t\t\t\t<div id=\"auth_icon\" class=\"auth_icon auth_icon_key\">\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_messages\" id=\"auth_messages\">\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_entercode\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">Xin ch\u00e0o!<\/div>\n\t\t\t\t\t\t<p>Ch\u00fang t\u00f4i th\u1ea5y b\u1ea1n \u0111ang \u0111\u0103ng nh\u1eadp v\u00e0o Steam t\u1eeb m\u1ed9t tr\u00ecnh duy\u1ec7t m\u1edbi ho\u1eb7c m\u1ed9t m\u00e1y t\u00ednh m\u1edbi. Ho\u1eb7c c\u00f3 l\u1ebd \u0111\u00e3 l\u00e2u qu\u00e1 r\u1ed3i...<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_checkspam\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">Nh\u1ea7m l\u1eabn v\u1edbi th\u01b0 r\u00e1c?<\/div>\n\t\t\t\t\t\t<p>B\u1ea1n \u0111\u00e3 ki\u1ec3m tra th\u01b0 m\u1ee5c tin nh\u1eafn r\u00e1c (Spam) ch\u01b0a? N\u1ebfu b\u1ea1n kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c tin nh\u1eafn t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam trong h\u1ed9p th\u01b0 ch\u00ednh, h\u00e3y th\u1eed t\u00ecm \u1edf \u0111\u00f3.<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_success\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">Th\u00e0nh c\u00f4ng!<\/div>\n\t\t\t\t\t\t<p>B\u00e2y gi\u1edd b\u1ea1n c\u00f3 th\u1ec3 truy c\u1eadp v\u00e0o t\u00e0i kho\u1ea3n Steam c\u1ee7a m\u00ecnh t\u1ea1i \u0111\u00e2y.<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">R\u1ea5t ti\u1ebfc!<\/div>\n\t\t\t\t\t\t<p>Xin l\u1ed7i nh\u01b0ng, <br>c\u00f3 g\u00ec \u0111\u00f3 kh\u00f4ng \u1ed5n...<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div class=\"auth_message\" id=\"auth_message_help\" style=\"display: none;\">\n\t\t\t\t\t\t<div class=\"auth_modal_h1\">H\u00e3y \u0111\u1ec3 ch\u00fang t\u00f4i gi\u00fap!<\/div>\n\t\t\t\t\t\t<p>R\u1ea5t ti\u1ebfc v\u00ec b\u1ea1n g\u1eb7p v\u1ea5n \u0111\u1ec1. Ch\u00fang t\u00f4i bi\u1ebft t\u00e0i kho\u1ea3n Steam n\u00e0y r\u1ea5t c\u00f3 gi\u00e1 tr\u1ecb \u0111\u1ed1i v\u1edbi b\u1ea1n, v\u00e0 ch\u00fang t\u00f4i cam k\u1ebft s\u1ebd gi\u00fap b\u1ea1n \u0111\u01b0a n\u00f3 cho \u0111\u00fang ng\u01b0\u1eddi.<\/p>\n\t\t\t\t\t<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div id=\"auth_details_messages\" class=\"auth_details_messages\">\n\t\t\t\t<div class=\"auth_details\" id=\"auth_details_entercode\" style=\"display: none;\">\n\t\t\t\t\tNh\u01b0 m\u1ed9t bi\u1ec7n ph\u00e1p b\u1ea3o m\u1eadt b\u1ed5 sung cho t\u00e0i kho\u1ea3n, b\u1ea1n s\u1ebd ph\u1ea3i c\u1ea5p quy\u1ec1n truy c\u1eadp v\u00e0o tr\u00ecnh duy\u1ec7t n\u00e0y b\u1eb1ng c\u00e1ch nh\u1eadp m\u00e3 s\u1ed1 \u0111\u1eb7c bi\u1ec7t m\u00e0 ch\u00fang t\u00f4i v\u1eeba \u0111\u00e3 g\u1eedi \u0111\u1ebfn \u0111\u1ecba ch\u1ec9 email <span id=\"emailauth_entercode_emaildomain\"><\/span> c\u1ee7a b\u1ea1n.\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_details\" id=\"auth_details_success\" style=\"display: none;\">\n\t\t\t\t\tN\u1ebfu \u0111\u00e2y l\u00e0 m\u1ed9t m\u00e1y t\u00ednh c\u00f4ng c\u1ed9ng, h\u00e3y ch\u1eafc ch\u1eafn \u0111\u0103ng xu\u1ea5t Steam  khi b\u1ea1n \u0111\u00e3 s\u1eb5n s\u00e0ng \u0111\u1ec3 tho\u00e1t phi\u00ean tr\u00ecnh duy\u1ec7t n\u00e0y.\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_details\" id=\"auth_details_help\" style=\"display: none;\">\n\t\t\t\t\tXin h\u00e3y li\u00ean h\u1ec7 \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam \u0111\u1ec3 \u0111\u01b0\u1ee3c m\u1ed9t nh\u00e2n vi\u00ean c\u1ee7a ch\u00fang t\u00f4i h\u1ed7 tr\u1ee3. C\u00e1c y\u00eau c\u1ea7u h\u1ed7 tr\u1ee3 v\u1ec1 truy c\u1eadp t\u00e0i kho\u1ea3n l\u00e0 \u01b0u ti\u00ean s\u1ed1 m\u1ed9t c\u1ee7a ch\u00fang t\u00f4i.\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"authcode_entry_area\">\n\t\t\t\t<div id=\"authcode_entry\">\n\t\t\t\t\t<div class=\"authcode_entry_box\">\n\t\t\t\t\t\t<input class=\"authcode_entry_input authcode_placeholder\" id=\"authcode\" type=\"text\" value=\"\"\n\t\t\t\t\t\t\t   placeholder=\"nh\u1eadp m\u00e3 c\u1ee7a b\u1ea1n \u1edf \u0111\u00e2y\">\n\n\t\t\t\t\t<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div id=\"authcode_help_supportlink\">\n\t\t\t\t\t<a href=\"https:\/\/help.steampowered.com\/vi\/faqs\/view\/06B0-26E6-2CF8-254C\" data-ajax=\"false\" data-externallink=\"1\">Li\u00ean h\u1ec7 \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam \u0111\u1ec3 \u0111\u01b0\u1ee3c gi\u00fap \u0111\u1ee1 v\u1edbi quy\u1ec1n truy c\u1eadp t\u00e0i kho\u1ea3n<\/a>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"modal_buttons\" id=\"auth_buttonsets\">\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_entercode\" style=\"display: none;\">\n\t\t\t\t\t<div data-modalstate=\"submit\" class=\"auth_button leftbtn\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">X\u00e1c nh\u1eadn<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">m\u00e3 truy c\u1eadp \u0111\u1eb7c bi\u1ec7t c\u1ee7a t\u00f4i<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div data-modalstate=\"checkspam\" class=\"auth_button\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">Tin nh\u1eafn n\u00e0o nh\u1ec9?<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c b\u1ea5t k\u1ef3 tin nh\u1eafn n\u00e0o t\u1eeb h\u1ec7 th\u1ed1ng h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_checkspam\" style=\"display: none;\">\n\t\t\t\t\t<div data-modalstate=\"submit\" class=\"auth_button leftbtn\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">T\u00ecm th\u1ea5y r\u1ed3i!<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">v\u00e0 t\u00f4i \u0111\u00e3 nh\u1eadp m\u00e3 truy c\u1eadp \u0111\u1eb7c bi\u1ec7t c\u1ee7a t\u00f4i \u1edf tr\u00ean<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div data-modalstate=\"help\"  class=\"auth_button\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">Ch\u1eb3ng c\u00f3 tri\u1ec3n v\u1ecdng...<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c b\u1ea5t k\u1ef3 tin nh\u1eafn n\u00e0o t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_success\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_button auth_button_spacer\">\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<a data-modalstate=\"complete\" class=\"auth_button\" id=\"success_continue_btn\" href=\"javascript:void(0);\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">Ti\u1ebfn h\u00e0nh \u0111\u1ebfn Steam!<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">&nbsp;<br>&nbsp;<\/div>\n\t\t\t\t\t<\/a>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div data-modalstate=\"submit\" class=\"auth_button leftbtn\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">T\u00f4i mu\u1ed1n th\u1eed l\u1ea1i<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">v\u00e0 t\u00f4i \u0111\u00e3 nh\u1eadp m\u00e3 \u0111\u1eb7c bi\u1ec7t c\u1ee7a t\u00f4i \u1edf ph\u00eda tr\u00ean<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div data-modalstate=\"help\" class=\"auth_button\">\n\t\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i ngh\u0129 t\u00f4i c\u1ea7n s\u1ef1 tr\u1ee3 gi\u00fap t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t\t<\/div>\n\t\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_buttonset\" id=\"auth_buttonset_waiting\" style=\"display: none;\">\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div style=\"\" id=\"auth_details_computer_name\" class=\"auth_details_messages\">\n\t\t\t\t\u0110\u1ec3 d\u1ec5 d\u00e0ng nh\u1eadn bi\u1ebft tr\u00ecnh duy\u1ec7t n\u00e0y trong danh s\u00e1ch c\u00e1c thi\u1ebft b\u1ecb c\u00f3 Steam Guard \u0111\u01b0\u1ee3c b\u1eadt, \u0111\u1eb7t cho tr\u00ecnh duy\u1ec7t m\u1ed9t c\u00e1i t\u00ean th\u00e2n thi\u1ec7n - \u00edt nh\u1ea5t 6 ch\u1eef c\u00e1i.\t\t\t\t<div id=\"friendly_name_box\" class=\"friendly_name_box\">\n\t\t\t\t\t<input class=\"authcode_entry_input authcode_placeholder\" id=\"friendlyname\" type=\"text\"\n\t\t\t\t\t\t   placeholder=\"nh\u1eadp bi\u1ec7t danh \u1edf \u0111\u00e2y\">\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div style=\"display: none;\">\n\t\t\t\t<input type=\"submit\">\n\t\t\t<\/div>\n\t\t<\/form>\n\t<\/div>\n\n\t<div class=\"login_modal loginIPTModal\" style=\"display: none\">\n\t\t<div class=\"auth_message_area\">\n\t\t\t<div class=\"auth_icon ipt_icon\">\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_messages\">\n\t\t\t\t<div class=\"auth_message\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">Xin l\u1ed7i<\/div>\n\t\t\t\t\t<p>T\u00e0i kho\u1ea3n n\u00e0y kh\u00f4ng th\u1ec3 \u0111\u01b0\u1ee3c truy c\u1eadp t\u1eeb m\u00e1y t\u00ednh n\u00e0y m\u00e0 kh\u00f4ng \u0111\u01b0\u1ee3c quy\u1ec1n b\u1ed5 sung.<\/p>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"auth_details_messages\">\n\t\t\t<div class=\"auth_details\">\n\t\t\t\tXin h\u00e3y li\u00ean h\u1ec7 \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam \u0111\u1ec3 \u0111\u01b0\u1ee3c m\u1ed9t nh\u00e2n vi\u00ean c\u1ee7a ch\u00fang t\u00f4i h\u1ed7 tr\u1ee3. C\u00e1c y\u00eau c\u1ea7u h\u1ed7 tr\u1ee3 v\u1ec1 truy c\u1eadp t\u00e0i kho\u1ea3n l\u00e0 \u01b0u ti\u00ean s\u1ed1 m\u1ed9t c\u1ee7a ch\u00fang t\u00f4i.\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"authcode_entry_area\">\n\t\t<\/div>\n\t\t<div class=\"modal_buttons\">\n\t\t\t<div class=\"auth_buttonset\" >\n\t\t\t\t<a href=\"https:\/\/help.steampowered.com\/\" class=\"auth_button leftbtn\" data-ajax=\"false\" data-externallink=\"1\">\n\t\t\t\t\t<div class=\"auth_button_h3\">T\u00ecm hi\u1ec3u th\u00eam<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">v\u1ec1 c\u00f4ng ngh\u1ec7 b\u1ea3o v\u1ec7 danh t\u00ednh Intel\u00ae<\/div>\n\t\t\t\t<\/a>\n\t\t\t\t<a href=\"https:\/\/support.steampowered.com\" class=\"auth_button\" data-ajax=\"false\" data-externallink=\"1\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin vui l\u00f2ng gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i ngh\u0129 r\u1eb1ng t\u00f4i c\u1ea7n s\u1ef1 tr\u1ee3 gi\u00fap t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t<\/a>\n\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t<\/div>\n\t\t<\/div>\n\t<\/div>\n\n\n\n\t<div class=\"login_modal loginTwoFactorCodeModal\" style=\"display: none;\">\n\t\t<form>\n\t\t<div class=\"twofactorauth_message_area\">\n\t\t\t<div id=\"login_twofactorauth_icon\" class=\"auth_icon auth_icon_key\">\n\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_messages\" id=\"login_twofactorauth_messages\">\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_entercode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">Xin ch\u00e0o <span id=\"login_twofactorauth_message_entercode_accountname\"><\/span>!<\/div>\n\t\t\t\t\t<p>T\u00e0i kho\u1ea3n n\u00e0y hi\u1ec7n \u0111ang s\u1eed d\u1ee5ng b\u1ed9 x\u00e1c th\u1ef1c Steam Guard di \u0111\u1ed9ng.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">R\u1ea5t ti\u1ebfc!<\/div>\n\t\t\t\t\t<p>Xin l\u1ed7i nh\u01b0ng, <br>c\u00f3 g\u00ec \u0111\u00f3 kh\u00f4ng \u1ed5n...<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">H\u00e3y \u0111\u1ec3 ch\u00fang t\u00f4i gi\u00fap!<\/div>\n\t\t\t\t\t<p>R\u1ea5t ti\u1ebfc v\u00ec b\u1ea1n g\u1eb7p v\u1ea5n \u0111\u1ec1. Ch\u00fang t\u00f4i bi\u1ebft t\u00e0i kho\u1ea3n Steam n\u00e0y r\u1ea5t c\u00f3 gi\u00e1 tr\u1ecb \u0111\u1ed1i v\u1edbi b\u1ea1n, v\u00e0 ch\u00fang t\u00f4i cam k\u1ebft s\u1ebd gi\u00fap b\u1ea1n \u0111\u01b0a n\u00f3 cho \u0111\u00fang ng\u01b0\u1eddi.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_sms_remove\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">X\u00e1c th\u1ef1c quy\u1ec1n s\u1edf h\u1eefu t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n<\/div>\n\t\t\t\t\t<p>Ch\u00fang t\u00f4i \u0111\u00e3 g\u1eedi m\u1ed9t tin nh\u1eafn ch\u1ee9a m\u00e3 ph\u1ee5c h\u1ed3i t\u00e0i kho\u1ea3n t\u1edbi s\u1ed1 \u0111i\u1ec7n tho\u1ea1i c\u00f3 c\u00e1c s\u1ed1 cu\u1ed1i <span id=\"login_twofactorauth_selfhelp_sms_remove_last_digits\"><\/span>. M\u1ed9t khi b\u1ea1n nh\u1eadp m\u00e3, ch\u00fang t\u00f4i s\u1ebd b\u1ecf b\u1ed9 x\u00e1c th\u1ef1c di \u0111\u1ed9ng kh\u1ecfi t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n v\u00e0 s\u1ebd g\u1ee7i m\u00e3 Steam Guard qua email.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_sms_remove_entercode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">X\u00e1c th\u1ef1c quy\u1ec1n s\u1edf h\u1eefu t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n<\/div>\n\t\t\t\t\t<p>Ch\u00fang t\u00f4i \u0111\u00e3 g\u1eedi m\u1ed9t tin nh\u1eafn ch\u1ee9a m\u00e3 x\u00e1c nh\u1eadn t\u1edbi s\u1ed1 \u0111i\u1ec7n tho\u1ea1i c\u00f3 \u0111u\u00f4i l\u00e0 <span id=\"login_twofactorauth_selfhelp_sms_remove_entercode_last_digits\"><\/span>. Nh\u1eadp m\u00e3 ph\u00eda d\u01b0\u1edbi \u0111\u1ec3 ch\u00fang t\u00f4i c\u00f3 th\u1ec3 g\u1ee1 b\u1ed9 x\u00e1c th\u1ef1c di \u0111\u1ed9ng ra kh\u1ecfi t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_sms_remove_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">R\u1ea5t ti\u1ebfc!<\/div>\n\t\t\t\t\t<p>Xin l\u1ed7i nh\u01b0ng, <br>c\u00f3 g\u00ec \u0111\u00f3 kh\u00f4ng \u1ed5n...<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_twofactor_removed\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">Th\u00e0nh c\u00f4ng!<\/div>\n\t\t\t\t\t<p>Ch\u00fang t\u00f4i \u0111\u00e3 b\u1ecf b\u1ed9 x\u00e1c th\u1ef1c di \u0111\u1ed9ng kh\u1ecfi t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n. L\u1ea7n \u0111\u0103ng nh\u1eadp t\u1edbi, b\u1ea1n s\u1ebd ph\u1ea3i nh\u1eadp m\u00e3 Steam Guard \u0111\u01b0\u1ee3c g\u1eedi qua \u0111\u1ecba ch\u1ec9 email.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_twofactor_replaced\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">Th\u00e0nh c\u00f4ng!<\/div>\n\t\t\t\t\t<p>Gi\u1edd \u0111\u00e2y b\u1ea1n c\u00f3 th\u1ec3 d\u00f9ng thi\u1ebft b\u1ecb n\u00e0y \u0111\u1ec3 l\u1ea5y m\u00e3 x\u00e1c th\u1ef1c di \u0111\u1ed9ng cho t\u00e0i kho\u1ea3n c\u1ee7a m\u00ecnh. B\u1ea5t k\u1ef3 thi\u1ebft b\u1ecb n\u00e0o tr\u01b0\u1edbc \u0111\u00e2y \u0111\u00e3 cung c\u1ea5p m\u00e3 x\u00e1c th\u1ef1c cho t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n s\u1ebd kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c n\u1eefa.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_nosms\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">B\u1ea1n c\u00f3 m\u00e3 ph\u1ee5c h\u1ed3i kh\u00f4ng?<\/div>\n\t\t\t\t\t<p>B\u1ea1n kh\u00f4ng c\u00f3 s\u1ed1 \u0111i\u1ec7n tho\u1ea1i n\u00e0o li\u00ean k\u1ebft v\u1edbi t\u00e0i kho\u1ea3n Steam, th\u1ebf n\u00ean ch\u00fang t\u00f4i kh\u00f4ng th\u1ec3 x\u00e1c th\u1ef1c quy\u1ec1n s\u1edf h\u1eefu t\u00e0i kho\u1ea3n qua tin nh\u1eafn. B\u1ea1n c\u00f3 ghi l\u1ea1i m\u00e3 ph\u1ee5c h\u1ed3i xu\u1ea5t hi\u1ec7n khi th\u00eam b\u1ed9 x\u00e1c th\u1ef1c di \u0111\u1ed9ng kh\u00f4ng? M\u00e3 n\u00e0y b\u1eaft \u0111\u1ea7u v\u1edbi ch\u1eef c\u00e1i \"R\".<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">Nh\u1eadp m\u00e3 ph\u1ee5c h\u1ed3i c\u1ee7a b\u1ea1n<\/div>\n\t\t\t\t\t<p>Xin vui l\u00f2ng nh\u1eadp m\u00e3 ph\u1ee5c h\u1ed3i v\u00e0o \u00f4 d\u01b0\u1edbi \u0111\u00e2y. M\u00e3 ph\u1ee5c h\u1ed3i b\u1eaft \u0111\u1ea7u v\u1edbi ch\u1eef c\u00e1i \"R\".<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode_incorrectcode\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">R\u1ea5t ti\u1ebfc!<\/div>\n\t\t\t\t\t<p>Xin l\u1ed7i nh\u01b0ng, <br>c\u00f3 g\u00ec \u0111\u00f3 kh\u00f4ng \u1ed5n...<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode_incorrectcode_exhausted\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">R\u1ea5t ti\u1ebfc!<\/div>\n\t\t\t\t\t<p>Xin l\u1ed7i nh\u01b0ng, <br>c\u00f3 g\u00ec \u0111\u00f3 kh\u00f4ng \u1ed5n...<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_rcode_message\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">R\u1ea5t ti\u1ebfc!<\/div>\n\t\t\t\t\t<p>Xin l\u1ed7i nh\u01b0ng, <br>c\u00f3 g\u00ec \u0111\u00f3 kh\u00f4ng \u1ed5n...<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_couldnthelp\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">H\u00e3y \u0111\u1ec3 ch\u00fang t\u00f4i gi\u00fap!<\/div>\n\t\t\t\t\t<p>N\u1ebfu b\u1ea1n m\u1ea5t quy\u1ec1n truy c\u1eadp t\u1edbi thi\u1ebft b\u1ecb di \u0111\u1ed9ng c\u1ee7a m\u00ecnh, s\u1ed1 di \u0111\u1ed9ng g\u1eafn li\u1ec1n v\u1edbi t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n, v\u00e0 kh\u00f4ng ghi l\u1ea1i m\u00e3 ph\u1ee5c l\u00fac b\u1ea1n th\u00eam b\u1ed9 x\u00e1c th\u1ef1c di \u0111\u1ed9ng th\u00ec xin vui l\u00f2ng li\u00ean h\u1ec7 \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam \u0111\u1ec3 \u0111\u1ed9i h\u1ed7 tr\u1ee3 trong vi\u1ec7c h\u1ed3i ph\u1ee5c quy\u1ec1n truy c\u1eadp t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_help\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">H\u00e3y \u0111\u1ec3 ch\u00fang t\u00f4i gi\u00fap!<\/div>\n\t\t\t\t\t<p>R\u1ea5t ti\u1ebfc v\u00ec b\u1ea1n g\u1eb7p v\u1ea5n \u0111\u1ec1. Ch\u00fang t\u00f4i bi\u1ebft t\u00e0i kho\u1ea3n Steam n\u00e0y r\u1ea5t c\u00f3 gi\u00e1 tr\u1ecb \u0111\u1ed1i v\u1edbi b\u1ea1n, v\u00e0 ch\u00fang t\u00f4i cam k\u1ebft s\u1ebd gi\u00fap b\u1ea1n \u0111\u01b0a n\u00f3 cho \u0111\u00fang ng\u01b0\u1eddi.<\/p>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"twofactorauth_message\" id=\"login_twofactorauth_message_selfhelp_failure\" style=\"display: none;\">\n\t\t\t\t\t<div class=\"auth_modal_h1\">Xin th\u1ee9 l\u1ed7i!<\/div>\n\t\t\t\t\t<p>\u0110\u00e3 c\u00f3 l\u1ed7i x\u1ea3y ra trong qu\u00e1 tr\u00ecnh x\u1eed l\u00fd y\u00eau c\u1ea7u c\u1ee7a b\u1ea1n.<\/p>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div id=\"login_twofactorauth_details_messages\" class=\"twofactorauth_details_messages\">\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_entercode\" style=\"display: none;\">\n\t\t\t\tNh\u1eadp m\u00e3 \u0111ang hi\u1ec3n th\u1ecb tr\u00ean \u1ee9ng d\u1ee5ng Steam di \u0111\u1ed9ng:\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp\" style=\"display: none;\">\n\t\t\t\tN\u1ebfu b\u1ea1n \u0111\u00e3 m\u1ea5t thi\u1ebft b\u1ecb di \u0111\u1ed9ng ho\u1eb7c \u0111\u00e3 x\u00f3a \u1ee9ng d\u1ee5ng Steam v\u00e0 kh\u00f4ng c\u00f2n kh\u1ea3 n\u0103ng nh\u1eadn m\u00e3, th\u00ec b\u1ea1n c\u00f3 th\u1ec3 b\u1ecf b\u1ed9 x\u00e1c th\u1ef1c di \u0111\u1ed9ng kh\u1ecfi t\u00e0i kho\u1ea3n c\u1ee7a m\u00ecnh. Vi\u1ec7c l\u00e0m n\u00e0y s\u1ebd gi\u1ea3m \u0111\u1ed9 b\u1ea3o m\u1eadt tr\u00ean t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n, th\u1ebf n\u00ean b\u1ea1n n\u00ean th\u00eam m\u1ed9t b\u1ed9 x\u00e1c th\u1ef1c v\u00e0o thi\u1ebft b\u1ecb di \u0111\u1ed9ng m\u1edbi ngay sau \u0111\u00f3.\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_help\" style=\"display: none;\">\n\t\t\t\tVui l\u00f2ng li\u00ean h\u1ec7 \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam \u0111\u1ec3 y\u00eau c\u1ea7u tr\u1ee3 gi\u00fap t\u1eeb m\u1ed9t th\u00e0nh vi\u00ean c\u1ee7a \u0111\u1ed9i ng\u0169 nh\u00e2n vi\u00ean c\u1ee7a ch\u00fang t\u00f4i.\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp_failure\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp_rcode_incorrectcode\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t\t<div class=\"twofactorauth_details\" id=\"login_twofactorauth_details_selfhelp_rcode_incorrectcode_exhausted\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"twofactorauthcode_entry_area\">\n\t\t\t<div id=\"login_twofactor_authcode_entry\">\n\t\t\t\t<div class=\"twofactorauthcode_entry_box\">\n\t\t\t\t\t<input class=\"twofactorauthcode_entry_input authcode_placeholder\" id=\"twofactorcode_entry\" type=\"text\"\n\t\t\t\t\t\t   placeholder=\"nh\u1eadp m\u00e3 c\u1ee7a b\u1ea1n \u1edf \u0111\u00e2y\" autocomplete=\"off\">\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div id=\"login_twofactor_authcode_help_supportlink\">\n\t\t\t\t<a href=\"https:\/\/help.steampowered.com\/vi\/faqs\/view\/06B0-26E6-2CF8-254C\">\n\t\t\t\t\tLi\u00ean h\u1ec7 \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam \u0111\u1ec3 \u0111\u01b0\u1ee3c gi\u00fap \u0111\u1ee1 v\u1edbi quy\u1ec1n truy c\u1eadp t\u00e0i kho\u1ea3n\t\t\t\t<\/a>\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div class=\"modal_buttons\" id=\"login_twofactorauth_buttonsets\">\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_entercode\" style=\"display: none;\">\n\t\t\t\t<div type=\"submit\" class=\"auth_button leftbtn\" data-modalstate=\"submit\">\n\t\t\t\t\t<div class=\"auth_button_h3\">X\u00e1c nh\u1eadn<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">m\u00e3 x\u00e1c th\u1ef1c c\u1ee7a t\u00f4i<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i kh\u00f4ng truy c\u1eadp \u0111\u01b0\u1ee3c m\u00e3 b\u1ed9 x\u00e1c th\u1ef1c di \u0111\u1ed9ng c\u1ee7a m\u00ecnh<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_incorrectcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"submit\">\n\t\t\t\t\t<div class=\"auth_button_h3\">T\u00f4i mu\u1ed1n th\u1eed l\u1ea1i<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">v\u00e0 t\u00f4i \u0111\u00e3 nh\u1eadp l\u1ea1i m\u00e3 x\u00e1c th\u1ef1c c\u1ee7a m\u00ecnh \u1edf ph\u00eda tr\u00ean<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i ngh\u0129 r\u1eb1ng m\u00ecnh c\u1ea7n gi\u00fap \u0111\u1ee1 t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div style=\"clear: left;\"><\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_start\">\n\t\t\t\t\t<div class=\"auth_button_h3\" style=\"font-size: 16px;\">G\u1ee1 b\u1ecf x\u00e1c th\u1ef1c<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">v\u00e0 quay l\u1ea1i d\u00f9ng c\u00e1ch th\u1ee9c nh\u1eadn m\u00e3 qua email<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_sms_reset_start\">\n\t\t\t\t\t<div class=\"auth_button_h3\">D\u00f9ng thi\u1ebft b\u1ecb n\u00e0y<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">v\u00e0 l\u1ea5y m\u00e3 x\u00e1c th\u1ef1c tr\u00ean \u1ee9ng d\u1ee5ng n\u00e0y<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_sms_remove\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_sendcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">OK!<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">G\u1eedi tin nh\u1eafn cho t\u00f4i<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_nosms\">\n\t\t\t\t\t<div class=\"auth_button_h3\">T\u00f4i kh\u00f4ng th\u1ec3<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">b\u1edfi v\u00ec t\u00f4i kh\u00f4ng c\u00f2n quy\u1ec1n truy c\u1eadp t\u1edbi s\u1ed1 \u0111i\u1ec7n tho\u1ea1i \u0111\u00f3<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_sms_remove_entercode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">X\u00e1c nh\u1eadn<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i \u0111\u00e3 nh\u1eadp m\u00e3 b\u00ean tr\u00ean<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_nosms\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c tin nh\u1eafn n\u00e0o<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_sms_remove_incorrectcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">X\u00e1c nh\u1eadn<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i \u0111\u00e3 nh\u1eadp l\u1ea1i m\u00e3. H\u00e3y c\u00f9ng th\u1eed l\u1ea1i n\u00e0o.<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_nosms\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c tin nh\u1eafn n\u00e0o<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_twofactor_removed\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_complete\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u0110\u0103ng nh\u1eadp<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">c\u00f9ng v\u1edbi vi\u1ec7c g\u1ee1 b\u1ecf b\u1ed9 x\u00e1c th\u1ef1c \u0111i \u0111\u1ed9ng<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_twofactor_replaced\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_sms_remove_complete\">\n\t\t\t\t\t<div class=\"auth_button_h3\">\u0110\u0103ng nh\u1eadp<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">t\u1edbi \u1ee9ng d\u1ee5ng di \u0111\u1ed9ng Steam<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_nosms\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_rcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">C\u00f3<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i c\u00f3 m\u00e3 ph\u1ee5c h\u1ed3i b\u1eaft \u0111\u1ea7u b\u1eb1ng \"R\"<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Kh\u00f4ng<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i kh\u00f4ng c\u00f3 b\u1ea5t k\u1ef3 m\u00e3 n\u00e0o nh\u01b0 th\u1ebf<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_rcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_rcode_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">G\u1eedi<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">m\u00e3 ph\u1ee5c h\u1ed3i c\u1ee7a t\u00f4i<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i ngh\u0129 m\u00ecnh c\u1ea7n s\u1ef1 gi\u00fap \u0111\u1ee1 t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_rcode_incorrectcode\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button leftbtn\" data-modalstate=\"selfhelp_rcode_checkcode\">\n\t\t\t\t\t<div class=\"auth_button_h3\">G\u1eedi<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i \u0111\u00e3 nh\u1eadp l\u1ea1i m\u00e3. H\u00e3y c\u00f9ng th\u1eed l\u1ea1i n\u00e0o.<\/div>\n\t\t\t\t<\/div>\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i ngh\u0129 m\u00ecnh c\u1ea7n s\u1ef1 gi\u00fap \u0111\u1ee1 t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_rcode_incorrectcode_exhausted\" style=\"display: none;\">\n\t\t\t\t<div class=\"auth_button\" data-modalstate=\"selfhelp_couldnthelp\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Xin gi\u00fap \u0111\u1ee1<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">T\u00f4i ngh\u0129 m\u00ecnh c\u1ea7n s\u1ef1 gi\u00fap \u0111\u1ee1 t\u1eeb \u0111\u1ed9i h\u1ed7 tr\u1ee3 Steam...<\/div>\n\t\t\t\t<\/div>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_selfhelp_couldnthelp\" style=\"display: none;\">\n\t\t\t\t<a class=\"auth_button leftbtn\" href=\"https:\/\/help.steampowered.com\/\">\n\t\t\t\t\t<div class=\"auth_button_h3\">Li\u00ean h\u1ec7 ch\u00fang t\u00f4i<\/div>\n\t\t\t\t\t<div class=\"auth_button_h5\">\u0111\u1ec3 nh\u1eadn gi\u00fap \u0111\u1ee1 v\u1edbi vi\u1ec7c truy c\u1eadp t\u00e0i kho\u1ea3n<\/div>\n\t\t\t\t<\/a>\n\t\t\t<\/div>\n\t\t\t<div class=\"auth_buttonset\" id=\"login_twofactorauth_buttonset_waiting\" style=\"display: none;\">\n\t\t\t<\/div>\n\t\t<\/div>\n\t\t<div style=\"display: none;\">\n\t\t\t<input type=\"submit\">\n\t\t<\/div>\n\t\t<\/form>\n\t<\/div>\n<\/div>\n" );
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

