const winston = require('winston');
const AWS = require('aws-sdk');

const SNS = new AWS.SNS({ apiVersion: '2010-03-31' });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const { SupportSNSArn: TopicArn } = process.env;
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
  ],
});


exports.dynamodbStreamHandler = async (event, context) => {
  await Promise.all(event.Records.map(async (record) => {
    logger.defaultMeta = { requestId: context.awsRequestId };
    logger.debug('event', { 'data': event });
    logger.debug('context', { 'data': context });
    const oldImage = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.OldImage);
    const newImage = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);

    // eslint-disable-next-line no-console
    logger.debug('OldImage', { 'data': oldImage });
    logger.debug('NewImage', { 'data': newImage });
    /*
      successfully_subscribed is set true:
        - for SaaS Contracts: no email is sent but after receiving the message in the subscription topic
        - for SaaS Subscriptions: after reciving the subscribe-success message in subscription-sqs.js
  
      subscription_expired is set to true:
        - for SaaS Contracts: after detecting expired entitlement in entitlement-sqs.js
        - for SaaS Subscriptions: after reciving the unsubscribe-success message in subscription-sqs.js
    */
    const grantAccess = newImage.successfully_subscribed === true &&
      typeof newImage.is_free_trial_term_present !== "undefined" &&
      (oldImage.successfully_subscribed !== true || typeof oldImage.is_free_trial_term_present === "undefined")


    const revokeAccess = newImage.subscription_expired === true
      && !oldImage.subscription_expired;

    let entitlementUpdated = false;

    if (newImage.entitlement && oldImage.entitlement && (newImage.entitlement !== oldImage.entitlement)) {
      entitlementUpdated = true;
    }

    logger.debug('grantAccess', { 'data': grantAccess });
    logger.debug('revokeAccess:', { 'data': revokeAccess });
    logger.debug('entitlementUpdated', { 'data': entitlementUpdated });

    if (grantAccess || revokeAccess || entitlementUpdated) {
      let message = '########## Customer Details ########## \n';
      let subject = '';

      message += 'Customer Identifier = ' + newImage.customerIdentifier + '\n';
      message += 'Customer Contact email = ' + newImage.contactEmail + '\n';
      message += 'Successfully subscribed = ' + newImage.successfully_subscribed + '\n';
      message += 'Company Name = ' + newImage.companyName + '\n';
      message += 'Is subscription expired = ' + newImage.subscription_expired + '\n';
      message += 'Customer Contact Name = ' + newImage.contactPerson + '\n';
      message += 'Customer Contact Number = ' + newImage.contactPhone + '\n';
      message += 'Product Code bought = ' + newImage.productCode + '\n\n';

      if(newImage.entitlement){
        logger.debug('entitlements', { 'data': JSON.parse(newImage.entitlement) });
        let entitlementData = JSON.parse(newImage.entitlement);
        if (entitlementData && entitlementData.Entitlements) {
          for (i=0; i < entitlementData.Entitlements.length ; i++) {
            let et = entitlementData.Entitlements[i];
            message += ' ########## Entitlement Details '+(i+1)+' ########## \n';
            message += 'Dimension = ' + et.Dimension + '\n';
            message += 'Product Code = ' + et.ProductCode + '\n';
            if(et.Value != null && et.Value.IntegerValue != null){
                    message += 'Quantity/Count = ' + et.Value.IntegerValue + '\n';
            }
            message += 'Expiration on = ' + et.ExpirationDate + '\n';
          }
        }
      }

      


      if (grantAccess) {
        subject = 'New AWS Marketplace Subscriber';
        message = 'Grant access to new SaaS customer:\n' + message;
         logger.debug('Enter grantAccess ...');

         var params = {
          MessageAttributes: {
            Author: {
              DataType: "String",
              StringValue: "User",
            }
          },
          MessageGroupId: "vcr.new.account",
          MessageDeduplicationId : newImage.customerIdentifier,
          MessageBody: JSON.stringify({
              "customerIdentifier": newImage.customerIdentifier,
              "productType": process.env.PRODUCT_TYPE,
              "org_id": process.env.MGMT_OU_ID,
              "userlist_file_s3_key": newImage.adUsersS3Key
            }),
          QueueUrl: process.env.ACCOUNT_CREATE_QUEUE_URL
        };
        
        let queueRes = await sqs.sendMessage(params).promise();
        logger.debug('grantAccess - queueRes', { 'data': queueRes });


      } else if (revokeAccess) {
        subject = 'AWS Marketplace customer end of subscription';
        message = 'Revoke access to SaaS customer: \n' + message;
        logger.debug('Enter revokeAccess ...');

        var params = {
          MessageAttributes: {
            Author: {
              DataType: "String",
              StringValue: "User",
            }
          },
          MessageGroupId: "vcr.unsubscribe.account",
          MessageDeduplicationId : newImage.customerIdentifier,
          MessageBody: JSON.stringify({
              "customerIdentifier": newImage.customerIdentifier,
              "productType": process.env.PRODUCT_TYPE,
              "accountId": newImage.VCRAccountId
            }),
          QueueUrl: process.env.FINAL_BILL_QUEUE_URL
        };
        
        let queueRes = await sqs.sendMessage(params).promise();
        logger.debug('revokeAccess - queueRes', { 'data': queueRes });

      } else if (entitlementUpdated) {
        subject = 'AWS Marketplace customer change of subscription';
        message = 'New entitlement for customer: \n' + message;
      }

      const SNSparams = {
        TopicArn,
        Subject: subject,
        Message: message,
      };

      logger.info('Sending notification');
      logger.debug('SNSparams', { 'data': SNSparams });
      await SNS.publish(SNSparams).promise();
      
    }
  }));


  return {};
};
