const IconService = require('icon-sdk-js');
const IOST = require('iost');
const Web3 = require('web3');

document.addEventListener('DOMContentLoaded', () => {
    addressFromInput.value = localStorage.getItem('from');
    addressToInput.value = localStorage.getItem('to');
    amountInput.value = localStorage.getItem('amount');
    let net = localStorage.getItem('net');
    netInput.value = net;
    privateKeyInput.value = localStorage.getItem('privateKey');
    pubkeyInput.value = localStorage.getItem('pubKey');

    netInput.onchange = event => onSwitchNet(event.target.value);
    if (net) {
        onSwitchNet(net);
    }

    signAndRevealButton.onclick = signTx.bind(this, 'reveal');
    signAndTransferButton.onclick = signTx.bind(this, 'transfer');
    signAndDelegateButton.onclick = signTx.bind(this, 'delegation');
    signAndOriginateButton.onclick = signTx.bind(this, 'origination');
    signAndVoteButton.onclick = signTx.bind(this, 'ballot');
    signAndSignUpButton.onclick = signTx.bind(this, 'sign-up');
    signAndPledgeButton.onclick = signTx.bind(this, 'pledge');
    signAndUnpledgeButton.onclick = signTx.bind(this, 'unpledge');
    signAndBuyRamButton.onclick = signTx.bind(this, 'buy-ram');
    signAndSellRamButton.onclick = signTx.bind(this, 'sell-ram');
    signAndClaimRewardButton.onclick = signTx.bind(this, 'claim-reward');
});

function onSwitchNet(net) {
    let displayIOSTSpecific = net === 'iost-coin' ? 'block' : 'none';
    pubkeyInput.style.display = displayIOSTSpecific;
    signAndSignUpButton.style.display = displayIOSTSpecific;
    signAndPledgeButton.style.display = displayIOSTSpecific;
    signAndUnpledgeButton.style.display = displayIOSTSpecific;
    signAndBuyRamButton.style.display = displayIOSTSpecific;

    signAndClaimRewardButton.style.display = ['iost-coin', 'icon'].includes(net) ? 'block' : 'none';
}

function signTx(opType) {
    localStorage.setItem('from', addressFromInput.value);
    localStorage.setItem('to', addressToInput.value);
    localStorage.setItem('amount', amountInput.value);
    localStorage.setItem('net', netInput.value);
    localStorage.setItem('privateKey', privateKeyInput.value);
    localStorage.setItem('pubKey', pubkeyInput.value);

    switch (netInput.value) {
        case 'tez':
            signTezTx(opType);
            break;
        case 'orbs':
        case 'iost':
            signETHTx(opType);
            break;
        case 'iost-coin':
            signIostCoinTx(opType);
            break;
        case 'icon':
            signICONTx(opType);
            break;
        default:
            alert(`Net ${netInput.value} is currently unsupported`);
            break;
    }
}

function signTezTx(opType) {
    let req = new XMLHttpRequest();
    if (['transfer', 'origination', 'delegation', 'reveal'].includes(opType)) {
        req.open('POST', `/net/tez/address/${addressFromInput.value}/transactions/prepare-${opType}`);
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify({
            toAddress: addressToInput.value,
            [opType == 'origination' ? 'balance' : 'amount']: amountInput.value
        }));
    }
    else if (opType == 'ballot') {
        req.open('POST', `/net/tez/voting/submit-ballot`);
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify({
            votingId: 1,
            delegate: addressFromInput.value,
            ballot: amountInput.value
        }));
    }
    //On response...
    req.onloadend = () => {
        //Parse response from JSON
        if (req.status !== 200) {
            alert(req.responseText);
            return;
        }

        let tx = JSON.parse(req.responseText);
        let privateKey = privateKeyInput.value;
        let signedTx = eztz.crypto.sign(tx.opbytes, privateKey, new Uint8Array([3]));
        //Sign prepared transaction with privateKey
        console.log('signedTx:', signedTx);
        //Send signed transaction
        req.open('POST', `/net/tez/address/${addressFromInput.value}/transactions/send`);
        req.setRequestHeader('Content-Type', 'application/json');

        req.send(JSON.stringify({ signedTransaction: { sopbytes: signedTx.sbytes } }));
        //On response display added transaction hash
        req.onloadend = () => alert('Sent! Hash: ' + req.responseText);
    };
}

function signETHTx(opType) {
    let web3js = new Web3();
    //Send request to prepare operation of opType type from specified address
    let req = new XMLHttpRequest();
    req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/prepare-${opType}`);
    req.setRequestHeader('Content-Type', 'application/json');
    req.send(JSON.stringify({
        toAddress: addressToInput.value,
        amount: amountInput.value
    }));
    //On response...
    req.onloadend = () => {
        //Parse response from JSON
        if (req.status !== 200) {
            alert(req.responseText);
            return;
        }

        let tx = JSON.parse(req.responseText);
        //Private key should start with 0x
        let privateKey = privateKeyInput.value;
        // if (!privateKey.startsWith('0x')) {
        //     privateKey = '0x' + privateKey;
        // }
        //Sign prepared transaction with privateKey
        web3js.eth.accounts.signTransaction(tx, privateKey).then(signedTx => {
            console.log('signedTx:', signedTx);
            //Send signed transaction
            req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/send`);
            req.setRequestHeader('Content-Type', 'application/json');
            req.send(JSON.stringify({ signedTransaction: signedTx.rawTransaction }));
            //On response display added transaction hash
            req.onloadend = () => alert('Sent! Hash: ' + req.responseText);
        });
    };
}

function signIostCoinTx(opType) {
    // if (opType != 'transfer' ) {
    //     return alert('Operation is not supported!');
    // }

    //Send request to prepare operation of opType type from specified address
    const req = prepareTransaction(opType);
    req.onloadend = () => {
        if (req.status !== 200) {
            alert(req.responseText);
            return;
        }

        let tx = JSON.parse(req.responseText);

        let privateKey = privateKeyInput.value;
        let kp = new IOST.KeyPair(Base58.decode(privateKey));

        let txObject = new IOST.Tx();
        for (let txKey in tx) {
            txObject[txKey] = tx[txKey];
        }
        txObject.addPublishSign(addressFromInput.value, kp);

        console.log(txObject)
        let signedTx = JSON.parse(JSON.stringify(txObject));
        console.log('signedTx:', signedTx);
        //Send signed transaction
        req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/send`);
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify({ signedTransaction: signedTx }));
        //On response display added transaction hash
        req.onloadend = () => alert('Sent! Hash: ' + req.responseText);
    };
}

function signICONTx(opType) {
    const req = prepareTransaction(opType);
    req.onloadend = () => {
        if (req.status !== 200) {
            alert(req.responseText);
            return;
        }

        let tx = JSON.parse(req.responseText);

        let signedTransactions = [];
        if (!(tx instanceof Array)) {
            tx = [tx];
        }
        for (let transaction of tx) {
            const wallet = IconService.IconWallet.loadPrivateKey(privateKeyInput.value);
            console.log(wallet);
            const signedTransaction = new IconService.SignedTransaction(transaction, wallet).getProperties();
            console.log('signedTransaction', signedTransaction);
            signedTransactions.push(signedTransaction);
        }


        // //Send signed transaction
        req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/send`);
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify({
            signedTransaction: signedTransactions.length == 1
                ? signedTransactions.pop()
                : signedTransactions
        }));
        //On response display added transaction hash
        req.onloadend = () => alert('Sent! Hash: ' + req.responseText);
    }
}

function prepareTransaction(opType) {
    let req = new XMLHttpRequest();
    req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/prepare-${opType}`);
    req.setRequestHeader('Content-Type', 'application/json');

    let reqData = {
        toAddress: addressToInput.value,
        amount: amountInput.value
    };
    if (opType === 'sign-up') {
        reqData.pubKey = pubkeyInput.value;
        reqData.name = addressToInput.value;
    }
    req.send(JSON.stringify(reqData));
    //On response...
    return req;
}